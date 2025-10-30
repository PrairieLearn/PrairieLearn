export function isValidOrcid(orcid: string): boolean {
  // Drop any dashes
  const digits = orcid.replaceAll('-', '');

  // Sanity check that should not fail since the ORCID identifier format is baked into the JSON schema
  if (!/^\d{15}[\dX]$/.test(digits)) {
    return false;
  }

  // Calculate and verify checksum
  // (adapted from Java code provided here: https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier)
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number.parseInt(digits[i])) * 2;
  }

  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const checkDigit = result === 10 ? 'X' : String(result);

  return digits[15] === checkDigit;
}


export function isValidEmail(emailValue: string): boolean {
    // Empty strings are fine.
  if (emailValue === '') {
    return true;
  }
  return String(emailValue)
        .toLowerCase()
        .match(/^([A-Z0-9_+-]+\.?)*[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i) != null;
}

export function isValidAuthorName(nameValue: string): boolean {
  const name = nameValue.trim();
  const nameLen = name.length;
  return nameLen === 0 || (nameLen >= 3 && nameLen <= 255);
}
