package com.swinglab.mobile;

import android.content.Context;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.net.*;
import java.io.*;
import java.lang.reflect.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

/** Real Android Keystore, loopback sockets, token validation and durable recovery.
 * Only identity/model network responses and browser launch are simulated. No provider account or inference. */
@RunWith(AndroidJUnit4.class)
public class NativeConnectionTest {
 Context context;NativeAgent agent;Fake remote;ActivityScenario<MainActivity> activity;
 static final String SCOPES="openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
 @Before public void start()throws Exception{
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();context.getSharedPreferences("swinglab-native",0).edit().clear().commit();
  remote=new Fake();agent=new NativeAgent(context,remote,(a,url)->remote.authorization.set(Uri.parse(url)));
  Field instance=NativeAgent.class.getDeclaredField("instance");instance.setAccessible(true);instance.set(null,agent);activity=ActivityScenario.launch(MainActivity.class);
 }
 @After public void finish()throws Exception{agent.cancelAuthorization();if(activity!=null)activity.close();}
 Object invoke(NativeAgent a,String name,Class<?>[] types,Object...args)throws Exception{Method m=NativeAgent.class.getDeclaredMethod(name,types);m.setAccessible(true);try{return m.invoke(a,args);}catch(InvocationTargetException e){throw (Exception)e.getCause();}}
 JSONObject status(NativeAgent a)throws Exception{return (JSONObject)invoke(a,"status",new Class<?>[]{});}
 void begin()throws Exception{invoke(agent,"connect",new Class<?>[]{boolean.class},false);long end=System.currentTimeMillis()+15000;while(remote.authorization.get()==null&&System.currentTimeMillis()<end)Thread.sleep(20);assertNotNull("Authorization browser was not launched",remote.authorization.get());}
 String callback(boolean validState)throws Exception{
  Uri auth=remote.authorization.get(),redirect=Uri.parse(auth.getQueryParameter("redirect_uri"));String query="code=qa-code&client_id=qa-issued&state="+URLEncoder.encode(validState?auth.getQueryParameter("state"):"wrong-state","UTF-8");
  try(Socket socket=new Socket("127.0.0.1",redirect.getPort())){socket.setSoTimeout(30000);socket.getOutputStream().write(("GET /auth/callback?"+query+" HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").getBytes("UTF-8"));ByteArrayOutputStream result=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=socket.getInputStream().read(buffer))!=-1)result.write(buffer,0,n);return result.toString("UTF-8");}
 }
 void awaitComplete()throws Exception{long end=System.currentTimeMillis()+10000;while(status(agent).getBoolean("connecting")&&System.currentTimeMillis()<end)Thread.sleep(20);assertFalse(status(agent).getBoolean("connecting"));}
 @Test public void validCallbackVerifiesIdentityPersistsSessionAndLoadsModelsBeforeSuccessPage()throws Exception{begin();String page=callback(true);awaitComplete();assertTrue(page.contains("Conexión lista"));JSONObject s=status(agent);assertTrue(s.getBoolean("connected"));assertTrue(s.getBoolean("enabled"));assertEquals("ready",s.getString("stage"));assertEquals(1,s.getJSONArray("models").length());assertEquals(1,remote.exchanges.get());assertEquals(0,remote.inferences.get());String stored=context.getSharedPreferences("swinglab-native",0).getString("encrypted_session","");assertFalse(stored.isEmpty());assertFalse(stored.contains("qa-access"));}
 @Test public void wrongStateDoesNotExchangeCodeAndValidAttemptCanStillComplete()throws Exception{begin();assertTrue(callback(false).startsWith("HTTP/1.1 400"));assertEquals(0,remote.exchanges.get());assertFalse(status(agent).getBoolean("connected"));assertTrue(callback(true).contains("Conexión lista"));}
 @Test public void badIdTokenNonceNeverInstallsSessionOrClaimsSuccess()throws Exception{remote.badNonce=true;begin();String page=callback(true);awaitComplete();assertTrue(page.contains("No se completó"));assertFalse(page.contains("Conexión lista"));assertFalse(status(agent).getBoolean("connected"));assertFalse(context.getSharedPreferences("swinglab-native",0).contains("encrypted_session"));assertEquals("verify_identity",status(agent).getString("stage"));}
 @Test public void newRuntimeRestoresEncryptedAccountWithoutBrowserAuthorization()throws Exception{begin();callback(true);awaitComplete();remote.authorization.set(null);NativeAgent restored=new NativeAgent(context,remote,(a,url)->{throw new AssertionError("Reopening must not request sign-in");});JSONObject s=(JSONObject)invoke(restored,"resumeConnection",new Class<?>[]{});assertTrue(s.getBoolean("connected"));assertEquals("ready",s.getString("stage"));assertEquals(0,remote.refreshes.get());}
 @Test public void expiredAccessRotatesBothTokensAndPersistsThemAcrossRestart()throws Exception{begin();callback(true);awaitComplete();Field field=NativeAgent.class.getDeclaredField("session");field.setAccessible(true);JSONObject old=(JSONObject)field.get(agent);old.put("expires_at",0);invoke(agent,"saveSession",new Class<?>[]{JSONObject.class},old);NativeAgent restored=new NativeAgent(context,remote,(a,url)->{throw new AssertionError("Refresh must not open a browser");});invoke(restored,"resumeConnection",new Class<?>[]{});assertEquals(1,remote.refreshes.get());NativeAgent again=new NativeAgent(context,remote,null);JSONObject saved=(JSONObject)field.get(again);assertEquals("qa-access-rotated",saved.getString("access_token"));assertEquals("qa-refresh-rotated",saved.getString("refresh_token"));assertTrue(saved.getLong("expires_at")>System.currentTimeMillis());}
 @Test public void catalogFailureKeepsAccountAndResumeRepairsWithoutAnotherLogin()throws Exception{remote.failCatalog=true;begin();assertTrue(callback(true).contains("No se completó"));awaitComplete();assertTrue(status(agent).getBoolean("connected"));assertFalse(status(agent).getString("error").isEmpty());remote.failCatalog=false;JSONObject s=(JSONObject)invoke(agent,"resumeConnection",new Class<?>[]{});assertEquals("ready",s.getString("stage"));assertEquals("",s.getString("error"));assertEquals(1,remote.exchanges.get());assertEquals(0,remote.inferences.get());}
 static String b64(byte[] bytes){return android.util.Base64.encodeToString(bytes,android.util.Base64.URL_SAFE|android.util.Base64.NO_WRAP|android.util.Base64.NO_PADDING);}
 static byte[] unsigned(java.math.BigInteger n){byte[] bytes=n.toByteArray();return bytes[0]==0?Arrays.copyOfRange(bytes,1,bytes.length):bytes;}
 static class Fake implements NativeAgent.Transport {
  final AtomicReference<Uri> authorization=new AtomicReference<>();final AtomicInteger exchanges=new AtomicInteger(),refreshes=new AtomicInteger(),inferences=new AtomicInteger();final KeyPair keys;volatile boolean badNonce=false,failCatalog=false;
  Fake()throws Exception{KeyPairGenerator gen=KeyPairGenerator.getInstance("RSA");gen.initialize(2048);keys=gen.generateKeyPair();}
  public JSONObject get(String url,String token)throws Exception{
   if(url.endsWith("openid-configuration"))return new JSONObject().put("issuer","https://auth.openai.com").put("jwks_uri","https://auth.openai.com/.well-known/jwks.json");
   if(url.endsWith("jwks.json")){RSAPublicKey pub=(RSAPublicKey)keys.getPublic();return new JSONObject().put("keys",new JSONArray().put(new JSONObject().put("kid","qa-key").put("kty","RSA").put("use","sig").put("n",b64(unsigned(pub.getModulus()))).put("e",b64(unsigned(pub.getPublicExponent())))));}
   if(url.endsWith("/models")){if(failCatalog)throw new IOException("simulated offline");return new JSONObject().put("models",new JSONArray().put(new JSONObject().put("slug","qa-model").put("visibility","list").put("display_name","QA model")));}
   inferences.incrementAndGet();throw new AssertionError("Unexpected network endpoint");
  }
  public JSONObject postForm(String url,Map<String,String> p)throws Exception{
   assertEquals("qa-issued",p.get("client_id"));assertEquals("https://api.openai.com/v1",p.get("resource"));
   if("refresh_token".equals(p.get("grant_type"))){refreshes.incrementAndGet();return new JSONObject().put("access_token","qa-access-rotated").put("refresh_token","qa-refresh-rotated").put("token_type","Bearer").put("expires_in",3600).put("scope",SCOPES);}
   exchanges.incrementAndGet();Uri auth=authorization.get();assertEquals("qa-code",p.get("code"));assertEquals(auth.getQueryParameter("redirect_uri"),p.get("redirect_uri"));assertEquals(auth.getQueryParameter("code_challenge"),b64(MessageDigest.getInstance("SHA-256").digest(p.get("code_verifier").getBytes("US-ASCII"))));
   String header=b64(new JSONObject().put("alg","RS256").put("kid","qa-key").toString().getBytes("UTF-8"));String claims=b64(new JSONObject().put("iss","https://auth.openai.com").put("aud","qa-issued").put("sub","qa-subject").put("email","qa@example.test").put("exp",System.currentTimeMillis()/1000+3600).put("nonce",badNonce?"bad-nonce":auth.getQueryParameter("nonce")).toString().getBytes("UTF-8"));Signature signature=Signature.getInstance("SHA256withRSA");signature.initSign(keys.getPrivate());signature.update((header+"."+claims).getBytes("US-ASCII"));return new JSONObject().put("access_token","qa-access").put("refresh_token","qa-refresh").put("token_type","Bearer").put("expires_in",3600).put("scope",SCOPES).put("id_token",header+"."+claims+"."+b64(signature.sign()));
  }
 }
}
