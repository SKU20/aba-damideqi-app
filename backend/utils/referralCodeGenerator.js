// Generate referral code (3 letters + 2 digits)
function generateReferralCode() {
  const letters = Array.from({ length: 3 }, () => 
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
  const numbers = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${letters}${numbers}`;
}

module.exports = generateReferralCode;
