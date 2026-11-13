const vietnamMobilePattern = /^0(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-46-9])[0-9]{7}$/;

export function normalizeVietnamesePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '');
  const national = compact.startsWith('+84')
    ? `0${compact.slice(3)}`
    : compact;
  if (!vietnamMobilePattern.test(national)) return null;
  return `+84${national.slice(1)}`;
}
