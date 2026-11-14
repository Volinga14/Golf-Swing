package com.swinglab.mobile;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ConnectionProtocolTest {
 private JSONObject saved()throws Exception{return new JSONObject().put("access_token","old-access").put("refresh_token","old-refresh").put("id_token","verified-identity").put("client_id","issued-client").put("subject","account-a").put("email","example@example.test").put("scope","openid resource.invoke chatgpt.tokens.use.direct offline_access").put("expires_at",1000000);}
 private JSONObject renewal()throws Exception{return new JSONObject().put("access_token","new-access").put("refresh_token","new-refresh").put("token_type","Bearer").put("expires_in",3600);}
 @Test public void restartUsesUnexpiredSavedSession()throws Exception{JSONObject restored=new JSONObject(saved().toString());assertFalse(ConnectionProtocol.shouldRefresh(restored,100000));assertTrue(ConnectionProtocol.planEnabled(restored));}
 @Test public void renewsNearExpiry()throws Exception{assertTrue(ConnectionProtocol.shouldRefresh(saved(),940000));assertTrue(ConnectionProtocol.shouldRefresh(saved(),1000001));}
 @Test public void rotationReplacesBothTokensAndKeepsAccount()throws Exception{JSONObject old=saved(),next=ConnectionProtocol.mergeRefresh(old,renewal(),2000000);assertEquals("new-access",next.getString("access_token"));assertEquals("new-refresh",next.getString("refresh_token"));assertEquals("issued-client",next.getString("client_id"));assertEquals("account-a",next.getString("subject"));assertEquals(5600000,next.getLong("expires_at"));assertTrue(ConnectionProtocol.planEnabled(next));assertEquals("old-refresh",old.getString("refresh_token"));}
 @Test public void failedRotationLeavesSavedSessionUnchanged()throws Exception{JSONObject old=saved();String before=old.toString();JSONObject bad=renewal().put("expires_in",0);try{ConnectionProtocol.mergeRefresh(old,bad,2000000);fail();}catch(Exception expected){}assertEquals(before,old.toString());}
 @Test public void missingRotatingTokenIsRejected()throws Exception{JSONObject bad=renewal();bad.remove("refresh_token");try{ConnectionProtocol.mergeRefresh(saved(),bad,2000000);fail();}catch(Exception expected){}}
 @Test public void revokedPermissionDoesNotReuseOldGrant()throws Exception{JSONObject next=ConnectionProtocol.mergeRefresh(saved(),renewal().put("scope","openid email"),2000000);assertFalse(ConnectionProtocol.planEnabled(next));}
 @Test public void inferenceNeedsBothPlanAndResourcePermission()throws Exception{assertFalse(ConnectionProtocol.planEnabled(new JSONObject().put("scope","chatgpt.tokens.use.direct")));assertFalse(ConnectionProtocol.planEnabled(new JSONObject().put("scope","resource.invoke")));}
 @Test public void firstRegistrationRequiresIssuedClient()throws Exception{assertEquals("issued-client",ConnectionProtocol.issuedClient(null,"issued-client"));for(String invalid:new String[]{null,"","dynamic_agent_client"})try{ConnectionProtocol.issuedClient(null,invalid);fail();}catch(Exception expected){}}
 @Test public void returningCallbackKeepsSelectedRegistration()throws Exception{assertEquals("issued-client",ConnectionProtocol.issuedClient("issued-client",null));try{ConnectionProtocol.issuedClient("issued-client","other-client");fail();}catch(Exception expected){}}
 @Test public void callbackMustMatchPendingState(){assertTrue(ConnectionProtocol.matchesState("secret-state","secret-state"));assertFalse(ConnectionProtocol.matchesState("secret-state",null));assertFalse(ConnectionProtocol.matchesState("secret-state","other-state"));}
 @Test public void catalogPreservesOrderAndFiltersHiddenModels()throws Exception{JSONArray models=new JSONArray().put(new JSONObject().put("slug","first").put("display_name","First").put("visibility","list")).put(new JSONObject().put("slug","hidden").put("visibility","hide")).put(new JSONObject().put("slug","second").put("visibility","list"));JSONArray result=ConnectionProtocol.catalog(new JSONObject().put("models",models));assertEquals(2,result.length());assertEquals("first",result.getJSONObject(0).getString("slug"));assertEquals("second",result.getJSONObject(1).getString("slug"));}
 @Test public void emptyOrUnexpectedCatalogNeverPretendsToConnect()throws Exception{for(JSONObject response:new JSONObject[]{new JSONObject(),new JSONObject().put("models",new JSONArray())})try{ConnectionProtocol.catalog(response);fail();}catch(Exception expected){}}
 @Test public void streamedUsageErrorExplainsRecoveryWithoutRetry()throws Exception{
 JSONObject error=new JSONObject().put("type","response.failed").put("response",new JSONObject().put("error",new JSONObject().put("code","subscription_sharing_usage_limit_exceeded")));
 String message=ConnectionProtocol.responseError(error);assertTrue(message.contains("Ajustes > Uso"));assertTrue(message.contains("No se repitió"));
 }
 @Test public void streamedErrorNeverReflectsArbitraryRemoteText()throws Exception{
 JSONObject event=new JSONObject().put("error",new JSONObject().put("code","<script>secret</script>").put("message","token-secret"));String message=ConnectionProtocol.responseError(event);assertTrue(message.contains("unknown_error"));assertFalse(message.contains("secret"));
 }
}