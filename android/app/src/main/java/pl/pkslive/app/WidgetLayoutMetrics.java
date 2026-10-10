package pl.pkslive.app;
/** Dimensions match the compact/standard XML; only complete rows are rendered. */
final class WidgetLayoutMetrics {
  final boolean compact,footerVisible;
  final int rowHeight,reservedHeight,capacity;
  WidgetLayoutMetrics(int height){
    compact=height<120;
    footerVisible=height>=108;
    rowHeight=compact?26:28;
    reservedHeight=(compact?44:52)+(footerVisible?12:0);
    capacity=Math.max(0,Math.min(10,(height-reservedHeight)/rowHeight));
  }
  WidgetLayoutMetrics(int height,WidgetAppearance appearance){
    compact=height<120;
    footerVisible=height>=108;
    boolean dense=compact||"compact".equals(appearance.density);
    int font=appearance.fontAdjustment(height);
    rowHeight=(compact?(appearance.showDelay?34:26):dense?(appearance.showDelay?40:28):(appearance.showDelay?44:32))+(font==2?6:font==-1?-1:0);
    reservedHeight=(compact?36:52)+(footerVisible?12:0);
    capacity=Math.max(0,Math.min(10,(height-reservedHeight)/rowHeight));
  }
}
