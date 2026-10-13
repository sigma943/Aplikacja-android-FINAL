package pl.pkslive.app;
/** Per-widget settings. No timers or wake locks; Android schedules the shared job. */
final class WidgetRefreshPolicy {
  final int minutes;
  final String mode;
  WidgetRefreshPolicy(int minutes,String mode){
    this.minutes=minutes>=1?minutes:30;
    this.mode="always".equals(mode)||"off".equals(mode)?mode:"battery-saver";
  }
  long intervalMillis(){return minutes*60000L;}
  long nextDelay(long updated,long attempted,long now,boolean powerSave){
    if(!enabled())return Long.MAX_VALUE;
    if(!allowed(powerSave))return Math.max(intervalMillis(),15*60000L);
    return Math.max(1000L,intervalMillis()-Math.max(0L,now-Math.max(updated,attempted)));
  }
  boolean enabled(){return !"off".equals(mode);}
  boolean allowed(boolean powerSave){return enabled()&&(!powerSave||"always".equals(mode));}
  boolean due(long updated,long attempted,long now,boolean powerSave){
    return allowed(powerSave)&&now-Math.max(updated,attempted)>=intervalMillis();
  }
}
