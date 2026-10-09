package pl.pkslive.app;

import android.graphics.*;
import org.json.JSONObject;

/** Appearance is stored per widget; existing widgets inherit the refreshed default style. */
final class WidgetAppearance {
  final boolean customized,dark,showDirections,showStatus,showDelay,showSeparators,highlightNext;
  final int transparency,cornerRadius,accent,foreground,muted;
  final String surface,density,textSize,lineColors;
  WidgetAppearance(JSONObject config,boolean dark){
    this.dark=dark;
    JSONObject value=config.optJSONObject("appearance");customized=value!=null;
    if(value==null)value=new JSONObject();
    int defaultTransparency=!customized&&!config.optBoolean("glass",true)?0:20;
    transparency=clamp(value.optDouble("transparency",defaultTransparency),defaultTransparency,100);
    cornerRadius=clamp(value.optDouble("cornerRadius",24),24,32);
    String raw=value.optString("accentColor","#14b8a6");
    accent=Color.parseColor(raw.matches("(?i)#[0-9a-f]{6}")?raw:"#14b8a6");
    foreground=Color.parseColor(dark?"#f1f5f9":"#0f172a");muted=Color.parseColor(dark?"#94a3b8":"#64748b");
    surface="neutral".equals(value.optString("surface"))?"neutral":"tinted";
    density="compact".equals(value.optString("density"))?"compact":"comfortable";
    String size=value.optString("textSize");textSize="small".equals(size)||"large".equals(size)?size:"normal";
    lineColors="accent".equals(value.optString("lineColors"))?"accent":"carrier";
    showDirections=value.optBoolean("showDirections",true);showStatus=value.optBoolean("showStatus",true);
    showDelay=value.optBoolean("showDelay",true);showSeparators=value.optBoolean("showSeparators",true);
    highlightNext=value.optBoolean("highlightNext",true);
  }
  static int clamp(double value,int fallback,int max){return Double.isNaN(value)||Double.isInfinite(value)?fallback:(int)Math.max(0,Math.min(max,Math.round(value)));}
  int fontAdjustment(int height){int adjustment="large".equals(textSize)?2:"small".equals(textSize)?-1:0;return height<90?Math.min(0,adjustment):adjustment;}
  static int alpha(int color,int alpha){return Color.argb(alpha,Color.red(color),Color.green(color),Color.blue(color));}
  static int mix(int base,int accent,double ratio){return Color.rgb((int)Math.round(Color.red(base)*(1-ratio)+Color.red(accent)*ratio),(int)Math.round(Color.green(base)*(1-ratio)+Color.green(accent)*ratio),(int)Math.round(Color.blue(base)*(1-ratio)+Color.blue(accent)*ratio));}
  private static double channel(int value){double s=value/255.;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);}
  private static double luminance(int color){return channel(Color.red(color))*.2126+channel(Color.green(color))*.7152+channel(Color.blue(color))*.0722;}
  int readable(int color){double background=luminance(Color.parseColor(dark?"#101e26":"#f8fafc"));for(int i=0;i<24;i++){double light=luminance(color);if((Math.max(light,background)+.05)/(Math.min(light,background)+.05)>=4.5)break;color=mix(color,dark?Color.WHITE:Color.BLACK,.1);}return color;}
  int lineColor(String carrier){return readable("accent".equals(lineColors)?accent:Color.parseColor("mpk".equals(carrier)?"#f97316":"marcel".equals(carrier)?"#84cc16":"#14b8a6"));}

  /** Bound bitmap memory across all launcher size variants. Text remains native and opaque. */
  Bitmap background(int width,int height,boolean glass){
    width=Math.max(1,width);height=Math.max(1,height);
    float scale=Math.min(1f,192f/Math.max(width,height));
    Bitmap bitmap=Bitmap.createBitmap(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),Bitmap.Config.ARGB_8888);
    Canvas canvas=new Canvas(bitmap);canvas.scale(scale,scale);
    Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);int opacity=Math.round(255*(1-transparency/100f));
    int base=Color.parseColor(dark?"#101e26":"#f8fafc");
    int top=alpha("neutral".equals(surface)?base:mix(base,accent,.16),opacity);
    int bottom=alpha("neutral".equals(surface)?base:mix(base,accent,.04),opacity);
    if(glass)paint.setShader(new LinearGradient(0,0,width*.25f,height,top,bottom,Shader.TileMode.CLAMP));else paint.setColor(bottom);
    RectF bounds=new RectF(.5f,.5f,width-.5f,height-.5f);
    canvas.drawRoundRect(bounds,cornerRadius,cornerRadius,paint);
    if(opacity>0){paint.setShader(null);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(alpha(readable(accent),56));canvas.drawRoundRect(bounds,cornerRadius,cornerRadius,paint);}
    return bitmap;
  }
  Bitmap badge(int color){Bitmap bitmap=Bitmap.createBitmap(40,24,Bitmap.Config.ARGB_8888);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(alpha(color,36));new Canvas(bitmap).drawRoundRect(new RectF(0,0,40,24),8,8,paint);return bitmap;}
  Bitmap control(int color,boolean round){Bitmap bitmap=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(alpha(color,26));Canvas canvas=new Canvas(bitmap);if(round)canvas.drawCircle(16,16,16,paint);else canvas.drawRoundRect(new RectF(0,0,32,32),8,8,paint);return bitmap;}
  Bitmap rowBackground(int width,int height,boolean highlight,boolean separator){
    width=Math.max(1,width);height=Math.max(1,height);float scale=Math.min(1f,192f/width);
    Bitmap bitmap=Bitmap.createBitmap(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),Bitmap.Config.ARGB_8888);
    Canvas canvas=new Canvas(bitmap);canvas.scale(scale,scale);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    if(highlight){paint.setColor(alpha(readable(accent),20));canvas.drawRoundRect(new RectF(0,0,width,height),10,10,paint);}
    if(separator){paint.setColor(alpha(foreground,20));paint.setStrokeWidth(1);canvas.drawLine(0,height-.5f,width,height-.5f,paint);}
    return bitmap;
  }
}
