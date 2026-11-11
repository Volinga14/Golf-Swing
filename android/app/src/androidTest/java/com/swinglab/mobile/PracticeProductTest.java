package com.swinglab.mobile;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Packaged UI and actual IndexedDB persistence on Android. No provider calls. */
@RunWith(AndroidJUnit4.class)
public class PracticeProductTest {
 String js(ActivityScenario<MainActivity> activity,String source)throws Exception{
  CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
  activity.onActivity(a->{try{Field f=MainActivity.class.getDeclaredField("web");f.setAccessible(true);((WebView)f.get(a)).evaluateJavascript(source,s->{value.set(s);done.countDown();});}catch(Exception e){throw new RuntimeException(e);}});
  assertTrue("WebView did not answer",done.await(10,TimeUnit.SECONDS));return value.get();
 }
 void await(ActivityScenario<MainActivity> activity,String condition)throws Exception{
  long until=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<until){if("true".equals(js(activity,condition)))return;Thread.sleep(100);}fail("UI condition timed out: "+condition);
 }
 @Test public void realPracticeControlsSaveAndSurviveActivityRestart()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   await(a,"typeof SwingLabPracticeUI==='object' && document.readyState==='complete'");
   js(a,"document.querySelector('[data-action=\"go-home\"]').click();document.querySelector('.nav-item[data-nav=\"profile\"]').click();document.querySelector('.training-entry [data-nav=\"train\"]').click();");
   await(a,"document.querySelectorAll('[data-drill]').length===6");
   js(a,"document.querySelector('[data-drill=\"SL02\"]').click();");
   await(a,"!!document.getElementById('demoPlay')");
   assertEquals("true",js(a,"document.querySelector('#drillVisual image').getAttribute('href').startsWith('data:image/webp;base64,')"));
   js(a,"document.getElementById('demoPlay').click();");assertEquals("\"Pausar\"",js(a,"document.getElementById('demoPlay').textContent"));
   js(a,"document.querySelector('[data-demo-step=\"1\"]').click();");assertEquals("\"50\"",js(a,"document.getElementById('demoPosition').value"));assertEquals("true",js(a,"document.getElementById('drillCue').textContent.includes('Giro corto')"));
   js(a,"document.getElementById('practiceMinutes').value='9';document.getElementById('practiceOutcome').value='working';document.getElementById('practiceNote').value='Android persistence QA';document.getElementById('practiceSave').click();");
   await(a,"document.getElementById('practiceSave').textContent==='Práctica guardada'");
   a.recreate();await(a,"typeof SwingLabProductBridge==='object' && document.readyState==='complete'");
   js(a,"window.__practiceQA=null;SwingLabProductBridge.ready().then(()=>SwingLabProductBridge.journal()).then(j=>window.__practiceQA=j.entries.find(e=>e.note==='Android persistence QA'));");
   await(a,"!!window.__practiceQA");
   JSONObject record=new JSONObject((String)new org.json.JSONTokener(js(a,"JSON.stringify(window.__practiceQA)")).nextValue());
   assertEquals(9,record.getInt("minutes"));assertEquals("SL02",record.getString("drill_id"));assertEquals("working",record.getString("outcome"));
   js(a,"document.querySelector('.nav-item[data-nav=\"profile\"]').click();document.querySelector('.training-entry [data-nav=\"train\"]').click();");await(a,"document.querySelectorAll('[data-drill]').length===6");
   assertEquals("true",js(a,"document.getElementById('practiceContent').textContent.includes('Criterio todavía en práctica')"));
  }
 }
}
