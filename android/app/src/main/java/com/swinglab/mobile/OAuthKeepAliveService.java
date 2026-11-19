package com.swinglab.mobile;

import android.app.*;
import android.content.*;
import android.os.*;

/** Keeps the loopback listener alive while the user authorizes in the system browser. */
public final class OAuthKeepAliveService extends Service {
 private final Handler timer=new Handler(Looper.getMainLooper());
 @Override public void onCreate(){
  super.onCreate();String channel="swinglab-connection";
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(channel,"Conexión con ChatGPT",NotificationManager.IMPORTANCE_LOW));
  Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent pending=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification notification=new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Conectando SwingLab con ChatGPT").setContentText("Completa la autorización y vuelve a la app.").setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).build();
  startForeground(8,notification);timer.postDelayed(this::stopSelf,660000);
 }
 @Override public int onStartCommand(Intent intent,int flags,int startId){return START_NOT_STICKY;}
 @Override public void onTimeout(int startId,int fgsType){stopSelf();}
 @Override public void onDestroy(){timer.removeCallbacksAndMessages(null);super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
}
