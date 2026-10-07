package pl.pkslive.app;
/** Per-widget settings. No timers or wake locks; Android schedules the shared job. */
final class WidgetRefreshPolicy {
  final int minutes;
  final String mode;
  WidgetRefreshPolicy(int minutes,String mode){
    this.minutes=minutes==15||minutes==30||minutes==60||minutes==120?minutes:30;
    this.mode="always".equals(mode)||"off".equals(mode)?mode:"battery-saver";
  }
  long intervalMillis(){return minutes*60000L;}
  boolean enabled(){return !"off".equals(mode);}
  boolean allowed(boolean powerSave){return enabled()&&(!powerSave||"always".equals(mode));}
  boolean due(long updated,long attempted,long now,boolean powerSave){
    return allowed(powerSave)&&now-Math.max(updated,attempted)>=intervalMillis();
  }
}
