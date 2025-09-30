import AuthService from './authService';

const referralService = {
  async getMyReferralData() {
    try {
      const res = await AuthService.makeRequest('/referral/me', { method: 'GET' });
      return res?.data || { referral_code: '', balance: 0, referrals: [] };
    } catch (e) {
      console.warn('referralService.getMyReferralData error:', e?.message || e);
      return { referral_code: '', balance: 0, referrals: [] };
    }
  },

  async validateCode(code) {
    try {
      const res = await AuthService.makeRequest('/referral/validate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      return res;
    } catch (e) {
      return { success: false, valid: false, error: e?.message || 'Failed' };
    }
  },

  async requestWithdrawal(payload = {}) {
    try {
      const res = await AuthService.makeRequest('/referral/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          full_name: payload.full_name || '',
          iban: payload.iban || '',
          bank_name: payload.bank_name || '',
          amount: payload.amount,
        }),
      });
      return res;
    } catch (e) {
      return { success: false, error: e?.message || 'Failed' };
    }
  },

  async getMyWithdrawals() {
    try {
      const res = await AuthService.makeRequest('/referral/withdrawals/me', {
        method: 'GET',
      });
      // Backend returns a top-level shape: { success: boolean, withdrawals: [] }
      return res || { success: false, withdrawals: [] };
    } catch (e) {
      return { success: false, withdrawals: [], error: e?.message || 'Failed' };
    }
  },
};

export default referralService;
