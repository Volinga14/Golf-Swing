package com.swinglab.mobile;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Protocol rules shared by authorization, restart recovery and token rotation. */
final class ConnectionProtocol {
 static class ProtocolException extends Exception{ProtocolException(String message){super(message);}}
 static boolean hasScope(String scopes,String expected){return Arrays.asList(scopes.trim().split("\\s+")).contains(expected);}
 static boolean planEnabled(JSONObject tokens){String scopes=tokens.optString("scope");return hasScope(scopes,"chatgpt.tokens.use.direct")&&hasScope(scopes,"resource.invoke");}
 static boolean shouldRefresh(JSONObject tokens,long now){return tokens.optLong("expires_at",0)<=now+60000;}
 static boolean matchesState(String expected,String received){return expected!=null&&received!=null&&MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),received.getBytes(StandardCharsets.US_ASCII));}
 static String issuedClient(String existing,String returned)throws Exception{
  String issued=returned==null?existing:returned;
  if(issued==null||issued.isEmpty()||issued.equals("dynamic_agent_client")||(existing!=null&&!existing.equals(issued)))throw new ProtocolException("El registro devuelto no coincide con la conexión solicitada.");
  return issued;
 }
 static void validateTokens(JSONObject tokens)throws Exception{
  if(!"Bearer".equalsIgnoreCase(tokens.optString("token_type"))||tokens.optString("access_token").isEmpty()||tokens.optLong("expires_in",0)<=0)throw new ProtocolException("La respuesta no contiene una sesión válida.");
 }
 static JSONObject mergeRefresh(JSONObject previous,JSONObject renewal,long now)throws Exception{
  validateTokens(renewal);
  if(renewal.optString("refresh_token").isEmpty())throw new ProtocolException("La renovación no devolvió la credencial de continuidad.");
  JSONObject next=new JSONObject(previous.toString());
  for(String key:new String[]{"access_token","refresh_token","token_type","expires_in","earliest_refresh_at"})if(renewal.has(key))next.put(key,renewal.get(key));
  if(renewal.has("scope"))next.put("scope",renewal.getString("scope"));
  next.put("expires_at",now+renewal.getLong("expires_in")*1000);
  return next;
 }
 static JSONArray catalog(JSONObject response)throws Exception{
  JSONArray source=response.optJSONArray("models");
  if(source==null)throw new ProtocolException("OpenAI devolvió un catálogo con un formato no reconocido.");
  JSONArray clean=new JSONArray();Set<String> seen=new HashSet<>();
  for(int i=0;i<source.length();i++){
   JSONObject m=source.optJSONObject(i);if(m==null)continue;String slug=m.optString("slug");
   if(m.optString("visibility").equals("list")&&!slug.isEmpty()&&seen.add(slug))clean.put(new JSONObject().put("slug",slug).put("display_name",m.optString("display_name",slug)));
  }
  if(clean.length()==0)throw new ProtocolException("La cuenta está conectada, pero OpenAI no ofrece modelos para este cliente. No necesitas volver a iniciar sesión para reintentar el catálogo.");
  return clean;
 }
}
