// Decode SVG data URLs only; gradient percentages are ordinary CSS, not URI escapes.
module.exports = function backgroundSvgs(backgroundImage) {
  return [...backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)]
    .map(match => (match[1] ?? match[2] ?? match[3]).trim())
    .filter(url => url.startsWith('data:image/svg+xml,'))
    .map(url => decodeURIComponent(url.slice('data:image/svg+xml,'.length)));
};
