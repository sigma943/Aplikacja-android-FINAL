package pl.pkslive.app;
/** Dimensions match the compact/standard XML; only complete rows are rendered. */
final class WidgetLayoutMetrics {
  final boolean compact,footerVisible;
  final int rowHeight,reservedHeight,capacity;
  WidgetLayoutMetrics(int height){
    compact=height<120;
    footerVisible=height>=100;
    rowHeight=compact?26:28;
    reservedHeight=(compact?36:44)+(footerVisible?12:0);
    capacity=Math.max(0,Math.min(10,(height-reservedHeight)/rowHeight));
  }
}
