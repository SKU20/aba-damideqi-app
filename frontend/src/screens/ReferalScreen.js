import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Share, Alert, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import referralService from '../services/referralService';

const ReferralScreen = ({ onClose, selectedLanguage = 'english' }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ referral_code: '', balance: 0, pending_amount: 0, referrals: [] });
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [activeTab, setActiveTab] = useState('referrals'); // 'referrals' | 'withdrawals'
  const [withdrawals, setWithdrawals] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyRemaining, setMonthlyRemaining] = useState(100);
  const insets = useSafeAreaInsets();

  const t = selectedLanguage === 'georgian' ? {
    title: 'რეფერალი',
    notice: 'რეფერალის თანხები იხდება ხელით. ადმინისტრაცია დაგიკავშირდებათ 24 საათის განმავლობაში სამუშაო დღეებში.',
    referralCode: 'რეფერალის კოდი',
    copy: 'კოპირება',
    share: 'გაზიარება',
    balance: 'ბალანსი (GEL)',
    requestWithdrawal: 'გამოტანის მოთხოვნა',
    referrals: 'რეფერალები',
    noReferrals: 'რეფერალები ჯერ არ არის',
    email: 'მეილი',
    status: 'სტატუსი',
    created: 'შექმნის თარიღი',
    awaitingPayment: 'მოწვეული მომხმარებლის გადახდის მოლოდინში',
    earnedPending: 'რეფერალი დარიცხულია, გადახდის მოლოდინში',
    fundsPaid: 'რეფერალის თანხა გადახდილია',
    withdrawalPending: 'გამოტანის მოლოდინში',
    close: 'დახურვა',
    withdrawTitle: 'გამოტანის მოთხოვნა',
    fullName: 'სრული სახელი',
    ibanLabel: 'IBAN',
    bankLabel: 'ბანკის სახელი',
    withdrawCta: 'გაგზავნა',
    withdrawNote: 'გთხოვთ მიუთითოთ სრული სახელი, IBAN, ბანკის სახელი და თანხა. თანხას მიიღებთ მომდევნო 24 საათში (შაბათ-კვირა არ შედის).',
    minWithdrawHint: 'მინ. გამოტანის თანხაა 10 ₾',
    monthlyLimit: 'თვიური ლიმიტი: 100 ₾',
    amountLabel: 'თანხა (₾)',
    totalEarnings: 'სულ შემოსავალი',
    totalReferrals: 'სულ რეფერალები'
  } : {
    title: 'Referral Program',
    notice: 'Referral funds are paid manually. An administrator will contact you within 24 hours during working days.',
    referralCode: 'Referral Code',
    copy: 'Copy',
    share: 'Share',
    balance: 'Available Balance',
    requestWithdrawal: 'Request Withdrawal',
    referrals: 'My Referrals',
    noReferrals: 'No referrals yet',
    email: 'Email',
    status: 'Status',
    created: 'Date',
    awaitingPayment: 'Awaiting payment',
    earnedPending: 'Earned, pending payout',
    fundsPaid: 'Funds paid',
    withdrawalPending: 'Withdrawal pending',
    close: 'Close',
    withdrawTitle: 'Withdrawal Request',
    fullName: 'Full Name',
    ibanLabel: 'IBAN',
    bankLabel: 'Bank Name',
    withdrawCta: 'Submit Request',
    withdrawNote: 'Please enter your full name, IBAN, bank name and withdrawal amount. You will receive funds within 24 hours (weekends excluded).',
    minWithdrawHint: 'Minimum withdrawal: 10 GEL',
    monthlyLimit: 'Monthly limit: 100 GEL',
    amountLabel: 'Amount (GEL)',
    totalEarnings: 'Total Earnings',
    totalReferrals: 'Total Referrals'
  };

  const load = useCallback(async () => {
    setLoading(true);
    const d = await referralService.getMyReferralData();
    setData(d);
    setLoading(false);
  }, []);

  const loadWithdrawals = useCallback(async () => {
    try {
      const res = await referralService.getMyWithdrawals();
      // Debug log to verify payload
      console.log('withdrawals response', res);
      if (res?.success) {
        setWithdrawals(res.withdrawals || []);
        const count = typeof res.count === 'number' ? res.count : (Array.isArray(res.withdrawals) ? res.withdrawals.length : 0);
      } else {
        Alert.alert('Withdrawals', res?.error || 'Could not load withdrawals');
      }
    } catch (_) {}
  }, []);

  useEffect(() => { load(); loadWithdrawals(); }, [load, loadWithdrawals]);

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(data.referral_code || '');
      Alert.alert('Copied', 'Referral code copied to clipboard');
    } catch (_) {}
  };

  const shareCode = async () => {
    try {
      await Share.share({ message: `Join using my referral code: ${data.referral_code}` });
    } catch (_) {}
  };

  const requestWithdrawal = async () => {
    setShowWithdrawModal(true);
  };

  const submitWithdrawal = async () => {
    if (!fullName.trim() || !iban.trim() || !bankName.trim()) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    const parsed = Math.floor(Number(amount));
    if (!Number.isFinite(parsed)) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parsed < 10) {
      Alert.alert('Error', 'Minimum withdrawal amount is 10 GEL');
      return;
    }
    const maxAvail = Math.max(0, Math.floor(Number(data.balance || 0)) - Math.floor(Number(data.pending_amount || 0)));
    if (parsed > maxAvail) {
      Alert.alert('Error', `Maximum available: ${maxAvail} GEL`);
      return;
    }
    if (parsed > monthlyRemaining) {
      Alert.alert('Error', `Monthly limit is 100 GEL. Remaining this month: ${monthlyRemaining} GEL`);
      return;
    }

    setWithdrawing(true);
    const res = await referralService.requestWithdrawal({
      full_name: fullName.trim(),
      iban: iban.trim(),
      bank_name: bankName.trim(),
      amount: parsed
    });
    setWithdrawing(false);

    if (res.success) {
      setShowWithdrawModal(false);
      setFullName(''); setIban(''); setBankName(''); setAmount('');
      Alert.alert('Success', res.message || 'Withdrawal request submitted');
      load();
    } else {
      Alert.alert('Error', res.error || 'Could not process withdrawal request');
    }
  };

  const getStatusTextForItem = (item) => {
    if (item.withdrawal_pending && !item.funds_paid) return t.withdrawalPending;
    if (item.status === 'pending') return t.awaitingPayment;
    if (item.status === 'completed' && !item.funds_paid) return t.earnedPending;
    if (item.status === 'completed' && item.funds_paid) return t.fundsPaid;
    return item.status || 'Unknown';
  };

  const getStatusStyleForItem = (item) => {
    if (item.withdrawal_pending && !item.funds_paid) return styles.statusEarned;
    if (item.status === 'pending') return styles.statusPending;
    if (item.status === 'completed' && !item.funds_paid) return styles.statusEarned;
    if (item.status === 'completed' && item.funds_paid) return styles.statusPaid;
    return styles.statusDefault;
  };

  const renderReferralItem = ({ item, index }) => (
    <View style={[styles.referralItem, index % 2 === 0 && styles.referralItemEven]}>
      <View style={styles.referralItemContent}>
        <View style={styles.referralMainInfo}>
          <Text style={styles.referralEmail} numberOfLines={1}>
            {item.invited_email || 'No email provided'}
          </Text>
          <Text style={styles.referralDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.referralStatus, getStatusStyleForItem(item)]}>
          <Text style={[styles.referralStatusText, getStatusStyleForItem(item)]}>
            {getStatusTextForItem(item)}
          </Text>
        </View>
      </View>
    </View>
  );

  const getWithdrawStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'requested') return styles.statusPending;
    if (s === 'approved') return styles.statusEarned;
    if (s === 'processed' || s === 'paid') return styles.statusPaid;
    if (s === 'rejected') return styles.statusDefault;
    return styles.statusDefault;
  };

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{(data.referrals || []).length}</Text>
          <Text style={styles.statLabel}>{t.totalReferrals}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{Number(data.balance || 0).toFixed(2)} ₾</Text>
          <Text style={styles.statLabel}>{t.balance}</Text>
        </View>
        {Number(data.pending_amount || 0) > 0 && (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Number(data.pending_amount).toFixed(2)} ₾</Text>
            <Text style={styles.statLabel}>Reserved</Text>
          </View>
        )}
      </View>

      {/* Referral Code Section */}
      <View style={styles.codeSection}>
        <Text style={styles.sectionTitle}>{t.referralCode}</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{data?.referral_code || '—'}</Text>
          <View style={styles.codeActions}>
            <TouchableOpacity style={styles.codeButton} onPress={copyCode}>
              <Text style={styles.codeButtonText}>{t.copy}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.codeButton} onPress={shareCode}>
              <Text style={styles.codeButtonText}>{t.share}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Withdrawal Section */}
      <View style={styles.withdrawalSection}>
        <TouchableOpacity 
          style={[styles.withdrawButton, (withdrawing || Number(data.balance) < 10) && styles.withdrawButtonDisabled]} 
          onPress={requestWithdrawal} 
          disabled={withdrawing || Number(data.balance) < 10}
        >
          <Text style={styles.withdrawButtonText}>
            {withdrawing ? 'Processing...' : t.requestWithdrawal}
          </Text>
        </TouchableOpacity>
        {Number(data.balance || 0) < 10 && (
          <Text style={styles.withdrawHint}>{t.minWithdrawHint}</Text>
        )}
        <Text style={[styles.withdrawHint, { marginTop: 6 }]}>{t.monthlyLimit}</Text>
      </View>

      {/* Referrals List Header */}
      <View style={styles.referralsHeader}>
        <Text style={styles.referralsTitle}>{t.referrals}</Text>
        <View style={styles.referralsCount}>
          <Text style={styles.referralsCountText}>{(data.referrals || []).length}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>{t.close}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1F2937" />
          <Text style={styles.loadingText}>Loading referral data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>{t.close}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity onPress={() => setActiveTab('referrals')} style={[styles.tabBtn, activeTab === 'referrals' && styles.tabBtnActive]}>
          <Text style={[styles.tabBtnText, activeTab === 'referrals' && styles.tabBtnTextActive]}>{t.referrals}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setActiveTab('withdrawals'); loadWithdrawals(); }} style={[styles.tabBtn, activeTab === 'withdrawals' && styles.tabBtnActive]}>
          <Text style={[styles.tabBtnText, activeTab === 'withdrawals' && styles.tabBtnTextActive]}>{selectedLanguage === 'georgian' ? 'გამოტანები' : 'Withdrawals'}</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'referrals' ? (
        <FlatList
          style={styles.content}
          data={data.referrals || []}
          keyExtractor={(item) => item.id}
          renderItem={renderReferralItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyReferrals}>
              <Text style={styles.emptyReferralsText}>{t.noReferrals}</Text>
              <Text style={styles.emptyReferralsSubtext}>
                Share your referral code to start earning rewards
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        />
      ) : (
        <FlatList
          style={styles.content}
          data={withdrawals}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.withdrawItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.withdrawAmount}>{Number(item.amount).toFixed(2)} ₾</Text>
                <Text style={styles.withdrawDate}>{new Date(item.created_at).toLocaleString()}</Text>
                {!!item.processed_at && (
                  <Text style={styles.withdrawProcessedDate}>
                    {selectedLanguage === 'georgian' ? 'დამუშავდა: ' : 'Processed: '} {new Date(item.processed_at).toLocaleString()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.withdrawField}>IBAN: <Text style={styles.withdrawFieldValue}>{item.iban || '—'}</Text></Text>
                <Text style={styles.withdrawField}>Bank: <Text style={styles.withdrawFieldValue}>{item.bank_name || '—'}</Text></Text>
              </View>
              <View style={[styles.withdrawStatusChip, getWithdrawStatusStyle(item.status)]}>
                <Text style={styles.withdrawStatusText}>{item.status || '—'}</Text>
              </View>
            </View>
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyReferrals}>
              <Text style={styles.emptyReferralsText}>{selectedLanguage === 'georgian' ? 'დეგისტრირებული გამოტანები არ არის' : 'No withdrawals yet'}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await loadWithdrawals(); setRefreshing(false); }}
        />
      )}

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.withdrawTitle}</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>{t.withdrawNote}</Text>
            
            <View style={styles.modalBalance}>
              <Text style={styles.modalBalanceText}>
                {t.balance}: {Number(data.balance || 0).toFixed(2)} GEL
              </Text>
            </View>
            <Text style={[styles.modalNote, { paddingTop: 8 }]}>{t.monthlyLimit}</Text>
            <Text style={[styles.modalNote, { paddingTop: 4 }]}>
              {selectedLanguage === 'georgian' ? 'დარჩენილი თვიური ლიმიტი: ' : 'Remaining this month: '} {monthlyRemaining} GEL
            </Text>

            <View style={styles.modalForm}>
              <TextInput
                style={styles.modalInput}
                placeholder={t.fullName}
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.modalInput}
                placeholder={t.ibanLabel}
                placeholderTextColor="#9CA3AF"
                value={iban}
                onChangeText={setIban}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.modalInput}
                placeholder={t.bankLabel}
                placeholderTextColor="#9CA3AF"
                value={bankName}
                onChangeText={setBankName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.modalInput}
                placeholder={t.amountLabel}
                placeholderTextColor="#9CA3AF"
                value={amount}
                onChangeText={setAmount}
                keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowWithdrawModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSubmitButton, withdrawing && styles.modalSubmitButtonDisabled]} 
                onPress={submitWithdrawal} 
                disabled={withdrawing}
              >
                <Text style={styles.modalSubmitText}>
                  {withdrawing ? 'Processing...' : t.withdrawCta}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },

  closeButton: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },

  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Content
  content: {
    flex: 1,
  },

  listContent: {
    paddingBottom: 20,
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabBtnActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  tabBtnText: {
    color: '#1F2937',
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },

  headerContent: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 20,
  },

  // Stats Cards
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },

  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },

  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Code Section
  codeSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },

  codeContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
  },

  codeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },

  codeButton: {
    flex: 1,
    backgroundColor: '#1F2937',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },

  codeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Withdrawal Section
  withdrawalSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  withdrawButton: {
    backgroundColor: '#1F2937',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  withdrawButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },

  withdrawButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  withdrawHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Referrals List
  referralsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  referralsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },

  referralsCount: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 32,
    alignItems: 'center',
  },

  referralsCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Withdrawals list
  withdrawItem: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  withdrawAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  withdrawDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  withdrawField: {
    fontSize: 12,
    color: '#6B7280',
  },
  withdrawFieldValue: {
    color: '#1F2937',
    fontWeight: '600',
  },
  withdrawStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  withdrawStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    textTransform: 'capitalize',
  },

  // Referral Items
  referralItem: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  referralItemEven: {
    backgroundColor: '#FEFEFE',
  },

  referralItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  referralMainInfo: {
    flex: 1,
    marginRight: 16,
  },

  referralEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  referralDate: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  referralStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },

  referralStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Status Styles
  statusPending: {
    backgroundColor: '#FEF3C7',
    color: '#D97706',
  },

  statusEarned: {
    backgroundColor: '#DBEAFE',
    color: '#2563EB',
  },

  statusPaid: {
    backgroundColor: '#D1FAE5',
    color: '#059669',
  },

  statusDefault: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },

  // Empty State
  emptyReferrals: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },

  emptyReferralsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptyReferralsSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },

  modalClose: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: '600',
  },

  modalNote: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    textAlign: 'center',
  },

  modalBalance: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  modalBalanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },

  modalForm: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  modalInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 12,
  },

  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },

  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },

  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },

  modalSubmitButton: {
    flex: 1,
    backgroundColor: '#1F2937',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },

  modalSubmitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },

  modalSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ReferralScreen;