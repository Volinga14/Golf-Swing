package com.swinglab.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
 private WebView web;
 private NativeAgent agent;
 private ValueCallback<Uri[]> chooser;
 private WebChromeClient.CustomViewCallback fullCallback;
 private View fullscreen;
 private static final int PICK_VIDEO=42;
 private static final String HOST="appassets.androidplatform.net";
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  web=new WebView(this);android.widget.FrameLayout root=new android.widget.FrameLayout(this);
  root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
  root.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setMediaPlaybackRequiresUserGesture(true);
  settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  agent=NativeAgent.attach(this,web);web.addJavascriptInterface(agent,"SwingLabNative");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    WebResourceResponse local=assets.shouldInterceptRequest(request.getUrl());
    if(local!=null)return local;
    if("https".equals(request.getUrl().getScheme()))return new WebResourceResponse("text/plain","UTF-8",403,"External resource blocked",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));
    return null;
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();if(HOST.equals(uri.getHost())&&"https".equals(uri.getScheme()))return false;
    if("https".equals(uri.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,uri));
    return true;
   }
  });
  web.setDownloadListener((url,userAgent,contentDisposition,mimeType,length)->agent.notice("Use the agent inside the Android app; file export is available in the web version."));
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
    if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;
    Intent intent=params.isCaptureEnabled()?new Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE):new Intent(Intent.ACTION_OPEN_DOCUMENT);if(!params.isCaptureEnabled())intent.addCategory(Intent.CATEGORY_OPENABLE);
    String[] accepted=params.getAcceptTypes();String type="video/*";if(accepted.length>0&&accepted[0].contains("json"))type="application/json";
    if(!params.isCaptureEnabled())intent.setType(type);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try{startActivityForResult(intent,PICK_VIDEO);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;}return true;
   }
   @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullscreen!=null){callback.onCustomViewHidden();return;}fullscreen=view;fullCallback=callback;web.setVisibility(View.GONE);addContentView(view,new ViewGroup.LayoutParams(-1,-1));}
   @Override public void onHideCustomView(){hideFullscreen();}
   @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Continue",(d,w)->result.confirm()).setNegativeButton("Cancel",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
   @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).show();return true;}
  });
  web.loadUrl("https://"+HOST+"/assets/index.html");
 }
 void shareResult(String contents)throws Exception{
  if(contents.length()>2000000)throw new Exception("Export too large");
  java.io.File directory=new java.io.File(getCacheDir(),"agent-exports");directory.mkdirs();
  boolean learning="swinglab-personal-learning/1".equals(new org.json.JSONObject(contents).optString("schema"));
  java.io.File file=new java.io.File(directory,learning?"SwingLab_mi_aprendizaje.json":"SwingLab_resultado_android.json");
  try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(contents.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  Uri uri=androidx.core.content.FileProvider.getUriForFile(this,getPackageName()+".files",file);
  Intent share=new Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  runOnUiThread(()->startActivity(Intent.createChooser(share,"Guardar o compartir SwingLab")));
 }
 void shareReport(String html)throws Exception{
  if(html.length()>16000000)throw new Exception("Report too large");
  java.io.File directory=new java.io.File(getCacheDir(),"agent-exports");directory.mkdirs();
  java.io.File file=new java.io.File(directory,"SwingLab_Informe_Entrenamiento.html");
  try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  Uri uri=androidx.core.content.FileProvider.getUriForFile(this,getPackageName()+".files",file);
  Intent share=new Intent(Intent.ACTION_SEND).setType("text/html").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  runOnUiThread(()->startActivity(Intent.createChooser(share,"Compartir informe de swing")));
 }
 private void hideFullscreen(){if(fullscreen==null)return;((ViewGroup)fullscreen.getParent()).removeView(fullscreen);fullscreen=null;web.setVisibility(View.VISIBLE);if(fullCallback!=null)fullCallback.onCustomViewHidden();fullCallback=null;}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==PICK_VIDEO&&chooser!=null){chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));chooser=null;}}
 @Override protected void onResume(){super.onResume();if(agent!=null)agent.resumed();}
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(agent!=null)agent.resumed();}
 @Override public void onBackPressed(){if(fullscreen!=null){hideFullscreen();return;}web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}const e=document.getElementById('fullscreenEditor');if(e&&!e.hidden&&window.SwingLabEditor){window.SwingLabEditor.close();return true;}return false;})()",value->{if("false".equals(value))finish();});}
 @Override protected void onDestroy(){agent.detach(this);web.removeJavascriptInterface("SwingLabNative");web.destroy();super.onDestroy();}
}
