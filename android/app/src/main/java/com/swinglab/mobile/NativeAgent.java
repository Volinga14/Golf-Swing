package com.swinglab.mobile;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.lang.ref.WeakReference;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.RSAPublicKeySpec;
import java.math.BigInteger;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Public OAuth client. HTTPS inference happens natively; credentials never enter WebView JS. */
public final class NativeAgent {
 private static final String AUTH="https://auth.openai.com", API="https://api.openai.com/v1", SCOPE="openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", KEY="swinglab.oauth.v1";
 interface Transport {JSONObject get(String url,String token)throws Exception;JSONObject postForm(String url,Map<String,String> params)throws Exception;}
 interface BrowserLauncher {void launch(Activity activity,String url)throws Exception;}
 private final Transport transport;private final BrowserLauncher browserLauncher;
 private static NativeAgent instance;
 private final Context context;private final Handler main=new Handler(Looper.getMainLooper());private WeakReference<Activity> activity=new WeakReference<>(null);private WeakReference<WebView> web=new WeakReference<>(null);private final SharedPreferences prefs;private final ExecutorService work=Executors.newCachedThreadPool();
 private final Object lock=new Object(),tokenLock=new Object(),catalogLock=new Object();private final AtomicBoolean busy=new AtomicBoolean(false);private final SecureRandom random=new SecureRandom();
 private JSONObject session,discovery;private JSONArray models=new JSONArray(),ledger=new JSONArray();private ServerSocket listener;private final AtomicBoolean connecting=new AtomicBoolean(false);private String stage="idle",lastError="",lastCode="";private JSONArray diagnostics=new JSONArray();private boolean reauthRequired=false;private final String hostId;private int attempts=0,authGeneration=0;private long catalogAt=0;private String catalogToken="";
 static synchronized NativeAgent attach(Activity a,WebView w){if(instance==null)instance=new NativeAgent(a.getApplicationContext());instance.activity=new WeakReference<>(a);instance.web=new WeakReference<>(w);return instance;}
 void detach(Activity a){if(activity.get()==a){activity.clear();web.clear();}}
 private NativeAgent(Context c){this(c,null,null);}
 NativeAgent(Context c,Transport transport,BrowserLauncher launcher){this.transport=transport;this.browserLauncher=launcher;context=c;prefs=c.getSharedPreferences("swinglab-native",0);String id=prefs.getString("host_id",null);if(id==null){id="urn:uuid:"+UUID.randomUUID();prefs.edit().putString("host_id",id).commit();}hostId=id;
  try{ledger=new JSONArray(prefs.getString("usage_ledger","[]"));diagnostics=new JSONArray(prefs.getString("connection_diagnostics","[]"));session=loadSession();}catch(Exception e){lastError="No se pudo recuperar la sesión protegida. Vuelve a conectar la cuenta.";lastCode="session_storage";}
  stage=session==null?"idle":"saved_session";
  if(prefs.getBoolean("oauth_pending",false)){prefs.edit().putBoolean("oauth_pending",false).commit();recordFailure("waiting_browser",new TrialException("Android interrumpió la autorización anterior. Pulsa Continue with ChatGPT para intentarlo de nuevo."));}
 }
 private Activity screen()throws TrialException{Activity a=activity.get();if(a==null||a.isFinishing())throw new TrialException("Abre SwingLab para continuar esta operación.");return a;}
 @JavascriptInterface public void call(String action,String json,String requestId){
  if(requestId==null||!requestId.matches("[A-Za-z0-9_-]{1,100}"))return;
  if(json==null||json.length()>20*1024*1024){respond(requestId,false,error("Request too large."));return;}
  work.execute(()->{try{JSONObject p=new JSONObject(json);JSONObject result;
   switch(action){
    case "status":result=status();break;
    case "shareResult":((MainActivity)screen()).shareResult(p.getString("contents"));result=new JSONObject().put("message","Choose where to share the result JSON.");break;
    case "shareReport":((MainActivity)screen()).shareReport(p.getString("html"));result=new JSONObject().put("message","Informe listo para compartir.");break;
    case "printReport":String html=p.getString("html");if(html.length()>16000000)throw new TrialException("El informe es demasiado grande.");Activity target=screen();main.post(()->ReportPrinter.print(target,html));result=new JSONObject().put("message","Selecciona Guardar como PDF.");break;
    case "connect":result=connect(p.optBoolean("force",false));break;
    case "resume":result=resumeConnection();break;
    case "models":result=modelList(true);break;
    case "cancelConnect":cancelAuthorization();result=status();break;
    case "selectModel":result=selectModel(p.optString("model"));break;
    case "review":result=infer(p,false);break;
    case "test":result=infer(p,true);break;
    case "disconnect":result=disconnect();break;
    default:throw new Exception("Unknown native operation.");
   }respond(requestId,true,result);
  }catch(Exception e){if(action.equals("models")||action.equals("connect")||action.equals("resume"))recordFailure(stage,e);respond(requestId,false,error(safeError(e)));}});
 }
 private JSONObject error(String text){JSONObject o=new JSONObject();try{o.put("error",text);}catch(Exception ignored){}return o;}
 private String safeError(Exception e){if(e instanceof TrialException||e instanceof ConnectionProtocol.ProtocolException)return e.getMessage();if(e instanceof java.net.SocketTimeoutException)return "La conexión agotó el tiempo de espera. Puedes reintentar la conexión; las peticiones de análisis no se repiten automáticamente.";return "No se pudo completar este paso. Comprueba la conexión a Internet y consulta el diagnóstico.";}
 private static class TrialException extends Exception{TrialException(String s){super(s);}}
 private void respond(String id,boolean ok,JSONObject data){JSONObject event=new JSONObject();try{event.put("id",id);event.put("ok",ok);event.put("data",data);}catch(Exception ignored){}emit("swinglab:native-reply",event);}
 private void emit(String name,JSONObject data){main.post(()->{WebView view=web.get();if(view!=null)view.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+data.toString()+"}));",null);});}
 void notice(String message){emit("swinglab:native-notice",error(message));}
 void resumed(){emit("swinglab:native-resume",new JSONObject());}
 private void phase(String value){synchronized(lock){stage=value;lastError="";lastCode="";}emit("swinglab:native-state",new JSONObject());}
 private void recordFailure(String at,Exception error){String code=error instanceof HttpFailure?((HttpFailure)error).code:error instanceof SocketTimeoutException?"timeout":error instanceof ConnectionProtocol.ProtocolException?"protocol_error":error instanceof TrialException?"connection_error":"network_or_storage";synchronized(lock){lastError=safeError(error);lastCode=code;try{diagnostics.put(new JSONObject().put("stage",at).put("code",code).put("message",lastError).put("at_ms",System.currentTimeMillis()));while(diagnostics.length()>30)diagnostics.remove(0);prefs.edit().putString("connection_diagnostics",diagnostics.toString()).apply();}catch(Exception ignored){}}emit("swinglab:native-state",new JSONObject());}
 private static class HttpFailure extends TrialException{final int status;final String code;HttpFailure(int s,String c){super("OpenAI devolvió "+s+" ("+c+"). La sesión se conserva; reintenta cuando haya conexión.");status=s;code=c;}}
 private String tokenString(int bytes){byte[] b=new byte[bytes];random.nextBytes(b);return url64(b);}
 private static String url64(byte[] b){return Base64.encodeToString(b,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
 private static byte[] un64(String s){return Base64.decode(s,Base64.URL_SAFE|Base64.NO_WRAP);}
 private JSONObject discover()throws Exception{if(discovery==null){JSONObject d=get(AUTH+"/.well-known/openid-configuration",null);if(!AUTH.equals(d.optString("issuer"))||!d.optString("jwks_uri").startsWith(AUTH+"/"))throw new TrialException("Unexpected OpenAI identity metadata.");discovery=d;}return discovery;}
 private HttpsURLConnection open(String target,String token)throws Exception{if(!(target.startsWith(AUTH+"/")||target.startsWith(API+"/")))throw new TrialException("Remote destination rejected.");HttpsURLConnection c=(HttpsURLConnection)new URL(target).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setRequestProperty("User-Agent","SwingLabAndroid/0.4");if(token!=null)c.setRequestProperty("Authorization","Bearer "+token);return c;}
 private String read(InputStream input,int maximum)throws Exception{if(input==null)return "";try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>maximum)throw new TrialException("Response exceeded the local size limit.");out.write(b,0,n);}return out.toString("UTF-8");}}
 private void check(HttpsURLConnection c)throws Exception{int status=c.getResponseCode();if(status>=200&&status<300)return;String code="http_"+status;try{JSONObject e=new JSONObject(read(c.getErrorStream(),65536));Object raw=e.opt("error");if(raw instanceof JSONObject)code=((JSONObject)raw).optString("code",code);else if(raw instanceof String)code=(String)raw;}catch(Exception ignored){}if(!code.matches("[A-Za-z0-9_.-]{1,100}"))code="http_"+status;
  if(code.equals("subscription_sharing_user_not_eligible"))throw new TrialException("This account, workspace or client is not eligible. Do not upgrade your plan to troubleshoot this automatically.");
  if(code.equals("subscription_sharing_usage_limit_exceeded"))throw new TrialException("Usage limit reached. Open ChatGPT Settings > Usage. No request was retried.");
  if(status==401||code.equals("invalid_grant")||code.equals("invalid_token")){synchronized(lock){reauthRequired=true;}throw new TrialException("La sesión ha caducado o fue revocada ("+code+"). Vuelve a autorizar la cuenta una vez.");}
  throw new HttpFailure(status,code);
 }
 private JSONObject get(String target,String token)throws Exception{if(transport!=null)return transport.get(target,token);HttpsURLConnection c=open(target,token);try{check(c);return new JSONObject(read(c.getInputStream(),4000000));}finally{c.disconnect();}}
 private String form(Map<String,String> p)throws Exception{StringBuilder b=new StringBuilder();for(Map.Entry<String,String> e:p.entrySet()){if(b.length()>0)b.append('&');b.append(URLEncoder.encode(e.getKey(),"UTF-8")).append('=').append(URLEncoder.encode(e.getValue(),"UTF-8"));}return b.toString();}
 private JSONObject postForm(String target,Map<String,String> p)throws Exception{if(transport!=null)return transport.postForm(target,p);HttpsURLConnection c=open(target,null);try{c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");try(OutputStream out=c.getOutputStream()){out.write(form(p).getBytes(StandardCharsets.UTF_8));}check(c);String body=read(c.getInputStream(),4000000);return body.isEmpty()?new JSONObject():new JSONObject(body);}finally{c.disconnect();}}
 private JSONObject status()throws Exception{synchronized(lock){JSONObject r=new JSONObject();r.put("connected",session!=null);r.put("enabled",session!=null&&ConnectionProtocol.planEnabled(session)&&!reauthRequired);r.put("account",session==null?JSONObject.NULL:session.optString("email","Cuenta conectada"));r.put("stage",stage);r.put("connecting",connecting.get());r.put("reauth_required",reauthRequired);r.put("error",lastError);r.put("error_code",lastCode);r.put("models",new JSONArray(models.toString()));r.put("selected_model",prefs.getString("selected_model",""));r.put("diagnostics",new JSONArray(diagnostics.toString()));r.put("ledger",new JSONArray(ledger.toString()));r.put("remaining_attempts",Math.max(0,3-attempts));return r;}}
 private boolean hasScope(String scopes,String expected){return ConnectionProtocol.hasScope(scopes,expected);}
 private JSONObject connect(boolean force)throws Exception{
  if(busy.get())throw new TrialException("Espera a que termine el análisis actual.");
  synchronized(lock){if(!force&&session!=null&&ConnectionProtocol.planEnabled(session)&&!reauthRequired)return new JSONObject().put("message","Tu sesión está guardada. Recuperando los modelos…").put("resume",true);}
  if(!connecting.compareAndSet(false,true))return new JSONObject().put("message","La autorización ya está abierta en el navegador. Complétala y vuelve a SwingLab.");
  ServerSocket created=null;
  try{
   final Activity origin=screen();final int generation;synchronized(lock){generation=++authGeneration;}final String state=tokenString(32),nonce=tokenString(32),verifier=tokenString(48),challenge=url64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
   final String existing=prefs.getString("client_id",null),expectedSubject=prefs.getString("subject",null);
   created=new ServerSocket(0,2,InetAddress.getByName("127.0.0.1"));created.setSoTimeout(1000);final ServerSocket server=created;listener=server;
   final String redirect="http://127.0.0.1:"+server.getLocalPort()+"/auth/callback";
   Map<String,String> p=new LinkedHashMap<>();p.put("client_id",existing==null?"dynamic_agent_client":existing);if(existing==null)p.put("agent_name_hint","SwingLab Android Trial");p.put("ext_agent_host_id",hostId);p.put("response_type","code");p.put("redirect_uri",redirect);p.put("scope",SCOPE);p.put("resource",API);p.put("state",state);p.put("nonce",nonce);p.put("code_challenge_method","S256");p.put("code_challenge",challenge);
   synchronized(lock){if(session!=null&&existing!=null){if(!session.optString("id_token").isEmpty())p.put("id_token_hint",session.getString("id_token"));if(!session.optString("email").isEmpty())p.put("login_hint",session.getString("email"));}}
   final String address=AUTH+"/api/accounts/authorize?"+form(p);
   prefs.edit().putBoolean("oauth_pending",true).commit();phase("waiting_browser");
   origin.startForegroundService(new Intent(origin,OAuthKeepAliveService.class));
   work.execute(()->{
    try{
     long end=System.currentTimeMillis()+600000;boolean completed=false;
     while(!completed&&connecting.get()&&System.currentTimeMillis()<end){
      Socket accepted;try{accepted=server.accept();}catch(SocketTimeoutException timeout){continue;}
      try(Socket socket=accepted){
       socket.setSoTimeout(5000);BufferedReader input=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));String line=readRequestLine(input);String[] parts=line.split(" ");Uri uri=parts.length>1?Uri.parse("http://127.0.0.1"+parts[1]):Uri.EMPTY;
       boolean valid=parts.length>1&&parts[0].equals("GET")&&"/auth/callback".equals(uri.getPath())&&ConnectionProtocol.matchesState(state,uri.getQueryParameter("state"));
       // Consume the complete HTTP header before replying/closing the loopback socket.
       int headerBytes=0;String header;while((header=input.readLine())!=null&&!header.isEmpty()){headerBytes+=header.length();if(headerBytes>16384)throw new TrialException("Callback demasiado grande.");}
       if(!valid){writeCallback(socket,false,"La respuesta no pertenece a esta autorización.",400);continue;}
       completed=true;
       try{
        if(uri.getQueryParameter("error")!=null)throw new TrialException("No se autorizó la conexión. Puedes intentarlo de nuevo.");
        String client=ConnectionProtocol.issuedClient(existing,uri.getQueryParameter("client_id"));synchronized(lock){if(generation!=authGeneration)throw new TrialException("La autorización se canceló.");prefs.edit().putString("client_id",client).commit();}
        String code=uri.getQueryParameter("code");if(code==null)throw new TrialException("La autorización volvió sin un código válido.");
        phase("exchange_code");Map<String,String> request=new LinkedHashMap<>();request.put("grant_type","authorization_code");request.put("client_id",client);request.put("code",code);request.put("code_verifier",verifier);request.put("redirect_uri",redirect);request.put("resource",API);
        JSONObject tokens=postForm(AUTH+"/api/accounts/oauth/token",request);phase("verify_identity");JSONObject identity=validateIdentity(tokens.optString("id_token"),client,nonce);
        if(expectedSubject!=null&&!expectedSubject.equals(identity.optString("sub")))throw new TrialException("La cuenta no coincide con el registro guardado. Usa la misma cuenta de ChatGPT.");
        ConnectionProtocol.validateTokens(tokens);tokens.put("client_id",client);tokens.put("email",identity.optString("email","Cuenta conectada"));tokens.put("subject",identity.getString("sub"));tokens.put("expires_at",System.currentTimeMillis()+tokens.getLong("expires_in")*1000);
        phase("save_session");synchronized(tokenLock){synchronized(lock){if(generation!=authGeneration||!connecting.get())throw new TrialException("La autorización se canceló.");saveSession(tokens);session=tokens;reauthRequired=false;models=new JSONArray();prefs.edit().putString("subject",identity.getString("sub")).commit();}}
        if(ConnectionProtocol.planEnabled(tokens)){modelList(false);}else{phase("permission_required");throw new TrialException("Cuenta guardada, pero falta el permiso para usar tu plan de ChatGPT. Vuelve a autorizarlo desde la app.");}
        writeCallback(socket,true,"Tu cuenta está guardada y el análisis está preparado.",200);
        emit("swinglab:native-connected",status());
       }catch(Exception e){if(generation==authGeneration)recordFailure(stage,e);writeCallback(socket,false,safeError(e),200);}
       finally{if(generation==authGeneration&&browserLauncher==null)main.post(()->{try{Activity a=activity.get();if(a!=null)a.startActivity(new Intent(a,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(Exception ignored){}});}

      }
     }
     if(!completed&&connecting.get())throw new TrialException("La autorización no volvió a la app en diez minutos. Pulsa Continue with ChatGPT para reiniciarla.");
    }catch(Exception e){if(connecting.get()&&generation==authGeneration)recordFailure(stage,e);}
    finally{try{server.close();}catch(Exception ignored){}synchronized(lock){if(generation==authGeneration){connecting.set(false);prefs.edit().putBoolean("oauth_pending",false).commit();context.stopService(new Intent(context,OAuthKeepAliveService.class));}}emit("swinglab:native-state",new JSONObject());}
   });
   main.post(()->{try{if(browserLauncher!=null)browserLauncher.launch(origin,address);else new androidx.browser.customtabs.CustomTabsIntent.Builder().setShowTitle(true).setSendToExternalDefaultHandlerEnabled(true).build().launchUrl(origin,Uri.parse(address));}catch(Exception e){recordFailure("open_browser",new TrialException("No se pudo abrir el navegador. Comprueba que tienes uno instalado."));cancelAuthorization();}});
   return new JSONObject().put("message","Completa la autorización en el navegador y vuelve a SwingLab. Los modelos se cargarán automáticamente.");
  }catch(Exception e){connecting.set(false);prefs.edit().putBoolean("oauth_pending",false).commit();if(created!=null)try{created.close();}catch(Exception ignored){}context.stopService(new Intent(context,OAuthKeepAliveService.class));throw e;}
 }
 private void writeCallback(Socket socket,boolean success,String message,int code)throws Exception{
  String escaped=message.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");
  String body="<!doctype html><html lang='es'><meta name='viewport' content='width=device-width,initial-scale=1'><title>SwingLab</title><body style='font:18px sans-serif;padding:32px;background:#f3f6ed;color:#214c39'><h1>"+(success?"Conexión lista":"No se completó la conexión")+"</h1><p>"+escaped+"</p><p><a style='display:inline-block;padding:16px;background:#214c39;color:white;border-radius:12px' href='swinglab-preview://auth/return'>Volver a SwingLab</a></p><p>Si el navegador sigue abierto, pulsa Volver a SwingLab.</p></body></html>";
  byte[] bytes=body.getBytes(StandardCharsets.UTF_8);OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 "+code+" "+(code==200?"OK":"Bad Request")+"\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();
 }
 private JSONObject resumeConnection()throws Exception{boolean canResume;synchronized(lock){canResume=session!=null&&ConnectionProtocol.planEnabled(session)&&!reauthRequired&&!connecting.get();}if(canResume)modelList(false);return status();}
 private String readRequestLine(BufferedReader in)throws Exception{StringBuilder b=new StringBuilder();int c;while((c=in.read())!=-1){if(c=='\n')break;if(c!='\r')b.append((char)c);if(b.length()>16384)throw new TrialException("Callback demasiado grande.");}return b.toString();}
 void cancelAuthorization(){synchronized(lock){authGeneration++;connecting.set(false);stage=session==null?"idle":"saved_session";}if(listener!=null)try{listener.close();}catch(Exception ignored){}prefs.edit().putBoolean("oauth_pending",false).commit();context.stopService(new Intent(context,OAuthKeepAliveService.class));}
 private JSONObject validateIdentity(String token,String client,String nonce)throws Exception{
  JSONObject d=discover();JSONArray keys=get(d.getString("jwks_uri"),null).getJSONArray("keys");
  try{String[] p=token.split("\\.");if(p.length!=3)throw new Exception();JSONObject head=new JSONObject(new String(un64(p[0]),StandardCharsets.UTF_8)),claims=new JSONObject(new String(un64(p[1]),StandardCharsets.UTF_8));if(!"RS256".equals(head.optString("alg")))throw new Exception();JSONObject key=null;for(int i=0;i<keys.length();i++){JSONObject k=keys.getJSONObject(i);if(k.optString("kid").equals(head.optString("kid"))&&k.optString("kty").equals("RSA")&&k.optString("use","sig").equals("sig"))key=k;}if(key==null)throw new Exception();
   PublicKey pub=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(new BigInteger(1,un64(key.getString("n"))),new BigInteger(1,un64(key.getString("e")))));Signature signature=Signature.getInstance("SHA256withRSA");signature.initVerify(pub);signature.update((p[0]+"."+p[1]).getBytes(StandardCharsets.US_ASCII));if(!signature.verify(un64(p[2])))throw new Exception();
   boolean audience=false;Object aud=claims.opt("aud");if(aud instanceof String)audience=client.equals(aud);if(aud instanceof JSONArray){JSONArray array=(JSONArray)aud;for(int i=0;i<array.length();i++)if(client.equals(array.getString(i)))audience=true;if(array.length()>1&&!client.equals(claims.optString("azp")))throw new Exception();}
   long now=System.currentTimeMillis()/1000;double expiry=claims.optDouble("exp",Double.NaN);if(!Double.isFinite(expiry)||!audience||!AUTH.equals(claims.optString("iss"))||claims.optDouble("exp",0)<=now||claims.optLong("nbf",0)>now+30||!nonce.equals(claims.optString("nonce"))||claims.optString("sub").isEmpty())throw new Exception();return claims;
  }catch(Exception e){throw new TrialException("OpenAI identity validation failed. No account connection was accepted.");}
 }
 private String accessToken()throws Exception{synchronized(tokenLock){JSONObject current;synchronized(lock){if(session==null||!ConnectionProtocol.planEnabled(session)||reauthRequired)throw new TrialException("Autoriza tu cuenta de ChatGPT para usar el agente.");current=session;}
  if(ConnectionProtocol.shouldRefresh(current,System.currentTimeMillis())){
   String refresh=current.optString("refresh_token");if(refresh.isEmpty()){synchronized(lock){reauthRequired=true;}throw new TrialException("La sesión guardada no permite renovación. Autoriza de nuevo la cuenta una vez.");}
   phase("refresh_session");Map<String,String> p=new LinkedHashMap<>();p.put("grant_type","refresh_token");p.put("client_id",current.getString("client_id"));p.put("refresh_token",refresh);p.put("resource",API);
   JSONObject renewal=postForm(AUTH+"/api/accounts/oauth/token",p),candidate=ConnectionProtocol.mergeRefresh(current,renewal,System.currentTimeMillis());
   synchronized(lock){if(session!=current)throw new TrialException("La cuenta cambió durante la renovación.");saveSession(candidate);session=candidate;current=candidate;reauthRequired=false;}
  }if(!ConnectionProtocol.planEnabled(current)){phase("permission_required");throw new TrialException("Falta el permiso para usar tu plan. Pulsa Continue with ChatGPT para autorizarlo.");}return current.getString("access_token");}}
 private JSONObject modelList(boolean force)throws Exception{synchronized(catalogLock){String token=accessToken();synchronized(lock){if(!force&&models.length()>0&&token.equals(catalogToken)&&System.currentTimeMillis()-catalogAt<600000){phase("ready");return new JSONObject().put("models",new JSONArray(models.toString())).put("selected_model",prefs.getString("selected_model",""));}}phase("fetch_models");JSONArray clean=ConnectionProtocol.catalog(get(API+"/models",token));synchronized(lock){if(session==null||!token.equals(session.optString("access_token")))throw new TrialException("La sesión cambió al cargar los modelos.");models=clean;catalogAt=System.currentTimeMillis();catalogToken=token;String selected=prefs.getString("selected_model","");boolean found=false;for(int i=0;i<models.length();i++)if(selected.equals(models.getJSONObject(i).getString("slug")))found=true;if(!found)prefs.edit().putString("selected_model",models.getJSONObject(0).getString("slug")).apply();}phase("ready");return new JSONObject().put("models",clean).put("selected_model",prefs.getString("selected_model",""));}}
 private JSONObject selectModel(String slug)throws Exception{synchronized(lock){for(int i=0;i<models.length();i++)if(slug.equals(models.getJSONObject(i).getString("slug"))){prefs.edit().putString("selected_model",slug).apply();return new JSONObject().put("selected_model",slug);}throw new TrialException("Selecciona uno de los modelos disponibles.");}}
 private JSONObject infer(JSONObject p,boolean test)throws Exception{
  if(!busy.compareAndSet(false,true))throw new TrialException("An inference is already running.");JSONObject record=null;long started=0;
  try{String token=accessToken(),model=p.optString("model");boolean found=false;synchronized(lock){if(attempts>=3)throw new TrialException("The experimental limit of three requests per app process is reached. Export your results before restarting.");for(int i=0;i<models.length();i++)if(models.getJSONObject(i).getString("slug").equals(model))found=true;}if(!found)throw new TrialException("Carga un modelo disponible antes de analizar.");prefs.edit().putString("selected_model",model).apply();
   JSONObject payload;
   if(test)payload=new JSONObject().put("model",model).put("input",new JSONArray().put(new JSONObject().put("role","user").put("content","Reply with exactly: SwingLab connection verified."))).put("store",false).put("stream",true);
   else{payload=p.getJSONObject("payload");if(!model.equals(payload.optString("model"))||payload.optBoolean("store",true)||!payload.optBoolean("stream",false)||!payload.has("instructions")||payload.optJSONArray("input")==null)throw new TrialException("Invalid image-review request.");}
   byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>20*1024*1024)throw new TrialException("Image package is too large.");
   started=System.currentTimeMillis();record=new JSONObject().put("model",model).put("kind",test?"connection_test":"swing").put("frames",test?0:p.optInt("frames",0)).put("request_bytes",bytes.length).put("status","sent").put("usage",JSONObject.NULL).put("at_utc",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US){{setTimeZone(TimeZone.getTimeZone("UTC"));}}.format(new Date()));synchronized(lock){attempts++;ledger.put(record);while(ledger.length()>100)ledger.remove(0);persistLedger();}
   HttpsURLConnection c=open(API+"/responses",token);StringBuilder output=new StringBuilder();boolean completed=false;try{c.setReadTimeout(180000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Accept","text/event-stream");c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}check(c);try(BufferedReader in=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){String line;StringBuilder data=new StringBuilder();while((line=in.readLine())!=null){if(line.length()>4000000)throw new TrialException("Response chunk too large.");if(line.isEmpty()){if(data.length()>0){JSONObject e=data.toString().equals("[DONE]")?null:new JSONObject(data.toString());data.setLength(0);if(e!=null){String type=e.optString("type");if(type.equals("response.output_text.delta")){output.append(e.optString("delta"));if(output.length()>2000000)throw new TrialException("Response too long.");}else if(type.equals("response.completed")){completed=true;JSONObject response=e.optJSONObject("response");if(response!=null)record.put("usage",response.has("usage")?response.get("usage"):JSONObject.NULL);}else if(type.equals("response.failed")||type.equals("response.incomplete")||type.equals("error"))throw new TrialException("Inference did not complete. It may have consumed usage; it was not retried.");}}}else if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).trim());}}}}
   finally{c.disconnect();}
   if(!completed)throw new TrialException("Inference ended without completion. Usage may have been consumed; no retry was made.");
   record.put("status","completed");record.put("duration_s",(System.currentTimeMillis()-started)/1000.0);persistLedger();return new JSONObject().put("text",output.toString()).put("record",record).put("ledger",new JSONArray(ledger.toString()));
  }catch(Exception e){if(record!=null){record.put("status","failed_or_unconfirmed");record.put("duration_s",(System.currentTimeMillis()-started)/1000.0);persistLedger();}throw e;}finally{busy.set(false);}
 }
 private void persistLedger(){synchronized(lock){prefs.edit().putString("usage_ledger",ledger.toString()).apply();}}
 private SecretKey encryptionKey()throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(KEY)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}return ((KeyStore.SecretKeyEntry)store.getEntry(KEY,null)).getSecretKey();}
 private void saveSession(JSONObject candidate)throws Exception{if(candidate==null){if(!prefs.edit().remove("encrypted_session").commit())throw new TrialException("No se pudo borrar la sesión del dispositivo.");return;}Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,encryptionKey());byte[] encrypted=c.doFinal(candidate.toString().getBytes(StandardCharsets.UTF_8));if(!prefs.edit().putString("encrypted_session",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(encrypted,Base64.NO_WRAP)).commit())throw new TrialException("No se pudo guardar la sesión de forma segura.");}
 private JSONObject loadSession()throws Exception{String saved=prefs.getString("encrypted_session",null);if(saved==null)return null;String[] split=saved.split(":");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,encryptionKey(),new GCMParameterSpec(128,Base64.decode(split[0],Base64.NO_WRAP)));return new JSONObject(new String(c.doFinal(Base64.decode(split[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
 private JSONObject disconnect()throws Exception{if(busy.get())throw new TrialException("Wait for inference to finish before disconnecting.");cancelAuthorization();JSONObject old;synchronized(tokenLock){synchronized(lock){old=session;saveSession(null);session=null;models=new JSONArray();reauthRequired=false;stage="idle";lastError="";lastCode="";prefs.edit().remove("selected_model").apply();}}boolean revoked=old==null||old.optString("refresh_token").isEmpty();if(!revoked)try{Map<String,String> p=new LinkedHashMap<>();p.put("token",old.getString("refresh_token"));p.put("token_type_hint","refresh_token");p.put("client_id",old.getString("client_id"));postForm(discover().getString("revocation_endpoint"),p);revoked=true;}catch(Exception ignored){}return new JSONObject().put("message",revoked?"Session disconnected.":"Local credentials cleared; remote revocation was not confirmed. Disconnect this app in ChatGPT Settings.");}
}
