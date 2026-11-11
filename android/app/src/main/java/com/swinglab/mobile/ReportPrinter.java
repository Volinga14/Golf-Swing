package com.swinglab.mobile;

import android.app.Activity;
import android.os.*;
import android.print.*;
import android.webkit.*;

/** Local HTML to Android's print/PDF dialog; no remote rendering service. */
final class ReportPrinter {
 private static final java.util.Set<WebView> activeViews=java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
 static void print(Activity activity,String html){
  WebView page=new WebView(activity);activeViews.add(page);page.getSettings().setJavaScriptEnabled(false);page.getSettings().setBlockNetworkLoads(true);
  page.setWebViewClient(new WebViewClient(){boolean started;
   @Override public void onPageFinished(WebView view,String url){if(started||activity.isFinishing()){if(!started){activeViews.remove(page);page.destroy();}return;}started=true;
    PrintDocumentAdapter delegate=page.createPrintDocumentAdapter("SwingLab · Informe de entrenamiento");
    PrintDocumentAdapter adapter=new PrintDocumentAdapter(){
     @Override public void onStart(){delegate.onStart();}
     @Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,CancellationSignal cancellation,LayoutResultCallback callback,Bundle extras){delegate.onLayout(oldAttributes,newAttributes,cancellation,callback,extras);}
     @Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,CancellationSignal cancellation,WriteResultCallback callback){delegate.onWrite(pages,destination,cancellation,callback);}
     @Override public void onFinish(){delegate.onFinish();activeViews.remove(page);page.destroy();}
    };
    ((PrintManager)activity.getSystemService(Activity.PRINT_SERVICE)).print("SwingLab · Informe",adapter,new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_COLOR).build());
   }
  });
  page.loadDataWithBaseURL("https://appassets.androidplatform.net/",html,"text/html","UTF-8",null);
 }
}
