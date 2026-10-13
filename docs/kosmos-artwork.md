# Kosmos planet imagery

The eight planet photographs are packaged locally; no external image requests are made at runtime. Source: NASA Science, [About the Planets](https://science.nasa.gov/solar-system/planets/). Photographs remain unmodified and retain their original aspect ratios. `scripts/build-cosmic-planets.mjs` wraps each photograph in a self-contained SVG with a static color matrix that makes its black background transparent. This is decoded as an ordinary image; panels do not use CSS background blending or backdrop filters. This avoids clipped composited backgrounds in Android WebView.

- Mercury: https://science.nasa.gov/wp-content/uploads/2024/03/pia15162-mercury-basins-messenger-16x9-1.jpg?w=1024
- Venus: https://science.nasa.gov/wp-content/uploads/2024/03/venus-mariner-10-pia23791-fig2-16x9-1.jpg?w=1024
- Earth: https://science.nasa.gov/wp-content/uploads/2024/03/blue-marble-apollo-17-16x9-1.jpg?w=1024
- Mars: https://science.nasa.gov/wp-content/uploads/2024/03/mars-full-globe-16x9-1.jpg?w=1024
- Jupiter: https://science.nasa.gov/wp-content/uploads/2024/03/jupiter-marble-pia22946-16x9-1.jpg?w=1024
- Saturn: https://science.nasa.gov/wp-content/uploads/2023/05/saturn-farewell-pia21345-sse-banner-1920x640-1.jpg?w=1024
- Uranus: https://science.nasa.gov/wp-content/uploads/2024/03/uranus-pia18182-16x9-1.jpg?w=1024
- Neptune: https://science.nasa.gov/wp-content/uploads/2024/03/pia01492-neptune-full-disk-16x9-1.jpg?w=1024
