/**
 * Optical calculation helpers for refraction values (SPH/CYL/AX).
 *
 * These are decision-support calculations only, meant to save the doctor a
 * few seconds of mental math (spherical equivalent, plus/minus-cylinder
 * transposition, a lens-type hint based on the numbers). They never replace
 * clinical judgment and the UI must always present them as suggestions.
 */

const toNumber = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/^\+/, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

const fmtDiopter = (n) => {
  if (n === null) return '';
  const sign = n > 0 ? '+' : n < 0 ? '' : '+';
  return `${sign}${n.toFixed(2)}`;
};

const normalizeAxis = (ax) => {
  let a = ax % 180;
  if (a < 0) a += 180;
  if (a === 0) a = 180;
  return a;
};

/**
 * Spherical Equivalent = SPH + (CYL / 2)
 * Used to gauge the overall myopic/hyperopic power of a prescription,
 * e.g. for a quick sense of contact-lens power or monovision planning.
 */
export function sphericalEquivalent(sph, cyl) {
  const s = toNumber(sph);
  const c = toNumber(cyl);
  if (s === null && c === null) return null;
  return (s || 0) + (c || 0) / 2;
}

/**
 * Transposition between plus-cylinder and minus-cylinder notation:
 *   new SPH = SPH + CYL
 *   new CYL = -CYL
 *   new AX  = AX ± 90 (normalized to 1-180)
 */
export function transpose(sph, cyl, ax) {
  const s = toNumber(sph);
  const c = toNumber(cyl);
  const a = toNumber(ax);
  if (s === null && c === null) return null;
  const newSph = (s || 0) + (c || 0);
  const newCyl = -(c || 0);
  const newAx = a === null ? null : normalizeAxis(a + 90);
  return {
    sph: fmtDiopter(newSph),
    cyl: newCyl === 0 ? '0.00' : fmtDiopter(newCyl),
    ax: newAx === null ? '' : String(newAx),
  };
}

/**
 * Rough, non-clinical lens-type suggestion based on power and cylinder,
 * intended purely as a quick-reference hint for the doctor while writing
 * the Rx — not a substitute for her own assessment of the patient's needs
 * (progressive vs. bifocal preference, occupational needs, etc).
 */
export function suggestLensType({ sph, cyl, age }) {
  const s = toNumber(sph);
  const c = toNumber(cyl);
  const ageNum = toNumber(age);
  const se = sphericalEquivalent(sph, cyl);
  const suggestions = [];

  if (se === null) return suggestions;

  const absCyl = Math.abs(c || 0);
  const absSph = Math.abs(s || 0);

  if (absCyl >= 0.75) {
    suggestions.push({
      label: 'عدسة أسطوانية (Toric)',
      note: `وجود استجماتيزم (CYL ${fmtDiopter(c)}) يستدعي عدسة تصحح المحورين معًا.`,
    });
  }

  if (ageNum !== null && ageNum >= 40) {
    suggestions.push({
      label: 'عدسة ثنائية/تدريجية (Bifocal / Progressive)',
      note: 'مع تقدم العمر (٤٠+) يُتوقع قصور تكيّف (Presbyopia) يستدعي إضافة قوة للقراءة.',
    });
  }

  if (absSph >= 6) {
    suggestions.push({
      label: 'عدسة عالية الانكسار (High-index)',
      note: `قوة الانكسار المرتفعة (${fmtDiopter(s)}) تجعل العدسة عالية الانكسار أخف وأرفع.`,
    });
  }

  if (se !== null && Math.abs(se) < 0.5 && absCyl < 0.5) {
    suggestions.push({
      label: 'لا حاجة لتصحيح بصري قوي',
      note: 'القيم قريبة من الصفر (SE ≈ 0)، قد لا تحتاج لعدسة تصحيحية دائمة.',
    });
  }

  return suggestions;
}
