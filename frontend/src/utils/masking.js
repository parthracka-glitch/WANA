/**
 * Privacy Minimization & PII Masking Utility (FE-16)
 * Mask email, phone numbers, and names by default to safeguard user privacy
 * on operational consoles and public dashboards.
 */

/**
 * Masks an email address: john.doe@example.com -> j****e@example.com
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'N/A';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '******';

  const [username, domain] = parts;
  if (username.length <= 2) {
    return `${username[0]}***@${domain}`;
  }
  const firstChar = username[0];
  const lastChar = username[username.length - 1];
  return `${firstChar}****${lastChar}@${domain}`;
}

/**
 * Masks a phone number: +91 9876543210 -> +91 ******3210
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 4) return '****';

  const lastFour = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) + ' ' : '';
  return `${prefix}******${lastFour}`;
}

/**
 * Masks a full name: Jane Doe -> J*** D***
 */
export function maskName(name) {
  if (!name || typeof name !== 'string') return 'Citizen';
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => (part.length > 1 ? `${part[0]}***` : part))
    .join(' ');
}

export default {
  maskEmail,
  maskPhone,
  maskName,
};
