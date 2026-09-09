/**
 * TrueHiveMark — renders the real PNG mark with a retina-aware srcSet.
 *
 * The srcSet tier is chosen to match the rendered pixel size so the browser
 * always picks the sharpest file for the display DPR.
 *
 * Accessibility: pass alt="" (the default) with aria-hidden wherever the mark
 * sits beside a TrueHiveWordmark — the link/wrapper already has aria-label="TrueHive home".
 * Only supply a real alt when the mark appears alone with no adjacent text.
 */

function _tier(size) {
  if (size <= 32) {
    return {
      src:    '/brand/truehive-mark-64.png',
      srcSet: '/brand/truehive-mark-64.png 1x, /brand/truehive-mark-128.png 2x, /brand/truehive-mark-256.png 3x',
    };
  }
  if (size <= 64) {
    return {
      src:    '/brand/truehive-mark-128.png',
      srcSet: '/brand/truehive-mark-128.png 1x, /brand/truehive-mark-256.png 2x, /brand/truehive-mark-512.png 3x',
    };
  }
  return {
    src:    '/brand/truehive-mark-256.png',
    srcSet: '/brand/truehive-mark-256.png 1x, /brand/truehive-mark-512.png 2x, /brand/truehive-mark.png 3x',
  };
}

export default function TrueHiveMark({ size = 32, className, alt, style }) {
  const { src, srcSet } = _tier(size);
  return (
    <img
      src={src}
      srcSet={srcSet}
      width={size}
      height={size}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      className={className}
      style={style}
      draggable="false"
    />
  );
}
