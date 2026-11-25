/**
 * Géométrie du splash, dans le repère 512 de la marque (assets/splash-mark.png et
 * assets/lottie/splash-mark-l.json, tirés de assets/logo.svg : « L » recentré, réduit à 78 %).
 * Toute modification de la marque doit mettre à jour ces valeurs.
 */

/** Taille du repère de la marque. */
export const MARK_UNITS = 512;

/** Point lavande : centre et diamètre. */
export const DOT = { x: 334.39, y: 227.92, d: 59.28 } as const;
/** Hauteur du rebond du point pendant l'intro du « L ». */
export const DOT_LIFT = 23.4;

/** Boîte du « L » (trait compris) : son bas sert de ligne de base au mot. */
export const L_BOX = { left: 148, right: 349.2, top: 130.4, bottom: 381.6 } as const;

/** Poppins Bold, en em : hauteur de capitale, ascendante, centre et diamètre du point du « i ». */
export const POPPINS = { cap: 0.697, ascent: 1.05, tittleY: 0.665, tittleD: 0.155 } as const;

/** Échelle de la marque une fois le mot écrit, et espace « L » – « ucia » (em). */
export const FINAL_SCALE = 0.56;
export const WORD_GAP = 0.06;

export interface Point {
  x: number;
  y: number;
}

/** Positions (pixels) dans un écran de `width` × `height`, marque de `size` px centrée. */
export function splashLayout(width: number, height: number, size: number) {
  const unit = size / MARK_UNITS;
  const origin = { x: (width - size) / 2, y: (height - size) / 2 };
  const center = { x: width / 2, y: height / 2 };
  const toScreen = (x: number, y: number): Point => ({
    x: origin.x + x * unit,
    y: origin.y + y * unit,
  });
  const lTop = toScreen(0, L_BOX.top).y;
  const lBottom = toScreen(0, L_BOX.bottom).y;
  const lLeft = toScreen(L_BOX.left, 0).x;
  const lWidth = (L_BOX.right - L_BOX.left) * unit * FINAL_SCALE;
  /** Taille du texte : sa capitale aurait la hauteur du « L » réduit. */
  const fontSize = ((lBottom - lTop) * FINAL_SCALE) / POPPINS.cap;
  const dot = toScreen(DOT.x, DOT.y);

  /** Position d'un point de la marque après réduction autour du centre et décalage `tx`. */
  const afterSlide = (p: Point, tx: number): Point => ({
    x: center.x + (p.x - center.x) * FINAL_SCALE + tx,
    y: center.y + (p.y - center.y) * FINAL_SCALE,
  });
  const baseline = center.y + (lBottom - center.y) * FINAL_SCALE;

  /** Placement du mot une fois sa largeur mesurée : ensemble « L ucia » centré. */
  function withWord(wordWidth: number) {
    const gap = WORD_GAP * fontSize;
    const left = (width - (lWidth + gap + wordWidth)) / 2;
    const tx = left - (center.x + (lLeft - center.x) * FINAL_SCALE);
    return {
      tx,
      wordLeft: left + lWidth + gap,
      // Texte sans interligne imposé : ligne de base à `ascent` em du haut (+0,01 : dépassement
      // optique des lettres rondes).
      wordTop: baseline - fontSize * (POPPINS.ascent + 0.01),
      dotAfterSlide: afterSlide(dot, tx),
      /** Centre du point du « ı » dont le centre horizontal est `iCenterX` (pixels écran). */
      tittle: (iCenterX: number): Point => ({ x: iCenterX, y: baseline - POPPINS.tittleY * fontSize }),
    };
  }

  return {
    fontSize,
    baseline,
    dot,
    dotSize: DOT.d * unit,
    dotLift: DOT_LIFT * unit,
    tittleSize: POPPINS.tittleD * fontSize,
    withWord,
  };
}
