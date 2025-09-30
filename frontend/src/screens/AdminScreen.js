import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import adminService from '../services/adminService';

export default function AdminScreen({ onBack }) {
  const [tab, setTab] = useState('users'); // 'users' | 'withdrawals'

  // Users tab state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userDetails, setUserDetails] = useState(null);

  // Withdrawals tab state
  const [wStatus, setWStatus] = useState('requested');
  const [wLoading, setWLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  const doSearch = async () => {
    setSearching(true);
    try {
      const data = await adminService.searchUsers(query);
      setResults(data);
    } catch (e) {
      Alert.alert('Admin', 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const openUser = async (user) => {
    setSelectedUser(user);
    setLoadingUser(true);
    setUserDetails(null);
    try {
      const data = await adminService.getUserDetails(user.id);
      setUserDetails(data);
    } catch (e) {
      Alert.alert('Admin', 'Failed to load user details');
    } finally {
      setLoadingUser(false);
    }
  };

  const loadWithdrawals = async () => {
    setWLoading(true);
    try {
      const list = await adminService.listWithdrawals(wStatus);
      setWithdrawals(list);
    } catch (e) {
      console.warn('Admin withdrawals fetch error:', e?.message || e);
      Alert.alert('Admin', 'Failed to load withdrawals');
    } finally {
      setWLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'withdrawals') {
      loadWithdrawals();
    }
  }, [tab, wStatus]);

  const approve = async (id) => {
    try {
      await adminService.approveWithdrawal(id);
      loadWithdrawals();
    } catch (e) {
      Alert.alert('Admin', 'Approve failed');
    }
  };

  const reject = async (id) => {
    try {
      await adminService.rejectWithdrawal(id);
      loadWithdrawals();
    } catch (e) {
      Alert.alert('Admin', 'Reject failed');
    }
  };

  const deleteCar = async (userId, carId) => {
    try {
      Alert.alert('Delete Car', 'This will remove the car, its photos, and its dashboard runs with videos. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await adminService.deleteCar(userId, carId);
            const data = await adminService.getUserDetails(userId);
            setUserDetails(data);
          } catch (e) {
            Alert.alert('Admin', 'Delete car failed');
          }
        }}
      ]);
    } catch (e) {}
  };

  const deleteRun = async (userId, runId) => {
    try {
      Alert.alert('Delete Run', 'This will remove the run and its uploaded video. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await adminService.deleteRun(userId, runId);
            const data = await adminService.getUserDetails(userId);
            setUserDetails(data);
          } catch (e) {
            Alert.alert('Admin', 'Delete run failed');
          }
        }}
      ]);
    } catch (e) {}
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabNavigation}>
        <TouchableOpacity 
          style={[styles.tabButton, tab === 'users' && styles.tabButtonActive]} 
          onPress={() => setTab('users')}
        >
          <Text style={[styles.tabButtonText, tab === 'users' && styles.tabButtonTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, tab === 'withdrawals' && styles.tabButtonActive]} 
          onPress={() => setTab('withdrawals')}
        >
          <Text style={[styles.tabButtonText, tab === 'withdrawals' && styles.tabButtonTextActive]}>
            Withdrawals
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {tab === 'users' ? (
          <>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by username..."
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  style={styles.searchButton} 
                  onPress={doSearch} 
                  disabled={searching}
                >
                  {searching ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.searchButtonText}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* User Content */}
            {!selectedUser ? (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                style={styles.listContainer}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.userItem} onPress={() => openUser(item)}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {(item.username?.[0] || '?').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.userDetails}>
                      <Text style={styles.userUsername}>@{item.username}</Text>
                      <Text style={styles.userFullName}>
                        {item.first_name || item.last_name 
                          ? `${item.first_name || ''} ${item.last_name || ''}`.trim()
                          : 'No name provided'
                        }
                      </Text>
                    </View>
                    <Text style={styles.viewArrow}>→</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateText}>
                      {query ? 'No users found' : 'Enter a username to search'}
                    </Text>
                  </View>
                }
              />
            ) : (
              <View style={styles.userDetailContainer}>
                <View style={styles.userDetailHeader}>
                  <TouchableOpacity 
                    onPress={() => { setSelectedUser(null); setUserDetails(null); }}
                    style={styles.backToListButton}
                  >
                    <Text style={styles.backToListText}>← Back to search</Text>
                  </TouchableOpacity>
                  <Text style={styles.userDetailTitle}>@{selectedUser.username}</Text>
                </View>

                {loadingUser ? (
                  <View style={styles.loadingStateContainer}>
                    <ActivityIndicator color="#1F2937" size="large" />
                    <Text style={styles.loadingStateText}>Loading user details...</Text>
                  </View>
                ) : userDetails ? (
                  <FlatList
                    data={[
                      { key: 'profile', title: 'Profile Information' },
                      { key: 'cars', title: `Vehicles (${userDetails.cars?.length || 0})` },
                      { key: 'runs', title: `Dashboard Runs (${Math.min(userDetails.runs?.length || 0, 50)})` },
                      { key: 'referrals', title: 'Referral Information' }
                    ]}
                    keyExtractor={(item) => item.key}
                    style={styles.detailsList}
                    contentContainerStyle={styles.detailsContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      switch (item.key) {
                        case 'profile':
                          return (
                            <View style={styles.sectionContainer}>
                              <Text style={styles.sectionTitle}>{item.title}</Text>
                              <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>ID:</Text>
                                  <Text style={styles.infoValue}>{userDetails.profile?.id}</Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Username:</Text>
                                  <Text style={styles.infoValue}>@{userDetails.profile?.username}</Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Name:</Text>
                                  <Text style={styles.infoValue}>
                                    {`${userDetails.profile?.first_name || ''} ${userDetails.profile?.last_name || ''}`.trim() || 'Not provided'}
                                  </Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Phone:</Text>
                                  <Text style={styles.infoValue}>
                                    {userDetails.profile?.phone || 'Not provided'}
                                  </Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Email:</Text>
                                  <Text style={styles.infoValue}>
                                    {userDetails.profile?.email || 'Not provided'}
                                  </Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Location:</Text>
                                  <Text style={styles.infoValue}>
                                    {[userDetails.profile?.city, userDetails.profile?.region, userDetails.profile?.country]
                                      .filter(Boolean).join(', ') || 'Not specified'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          );

                        case 'cars':
                          return (
                            <View style={styles.sectionContainer}>
                              <Text style={styles.sectionTitle}>{item.title}</Text>
                              {(userDetails.cars || []).length === 0 ? (
                                <View style={styles.emptySection}>
                                  <Text style={styles.emptySectionText}>No vehicles found</Text>
                                </View>
                              ) : (
                                (userDetails.cars || []).map((car) => (
                                  <View key={car.id} style={styles.itemCard}>
                                    <View style={styles.itemCardContent}>
                                      <View style={styles.itemInfo}>
                                        <Text style={styles.itemTitle}>
                                          {car.vehicle_type?.toUpperCase() || 'VEHICLE'} • {car.year || 'Unknown Year'}
                                        </Text>
                                        <Text style={styles.itemSubtitle}>
                                          {car.car_brands?.name || car.moto_brands?.name || car.custom_brand || 'Unknown'} {car.car_models?.name || car.moto_models?.name || car.custom_model || ''}
                                        </Text>
                                      </View>
                                      <TouchableOpacity 
                                        style={styles.dangerButton} 
                                        onPress={() => deleteCar(userDetails.profile?.id, car.id)}
                                      >
                                        <Text style={styles.dangerButtonText}>Delete</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          );

                        case 'runs':
                          const displayRuns = (userDetails.runs || []).slice(0, 50);
                          return (
                            <View style={styles.sectionContainer}>
                              <Text style={styles.sectionTitle}>{item.title}</Text>
                              {displayRuns.length === 0 ? (
                                <View style={styles.emptySection}>
                                  <Text style={styles.emptySectionText}>No dashboard runs found</Text>
                                </View>
                              ) : (
                                displayRuns.map((run) => (
                                  <View key={run.id} style={styles.itemCard}>
                                    <View style={styles.itemCardContent}>
                                      <View style={styles.itemInfo}>
                                        <Text style={styles.itemTitle}>
                                          {run.range || 'Unknown Range'} • {run.best_elapsed_ms ? `${run.best_elapsed_ms} ms` : 'No Time'}
                                        </Text>
                                        <Text style={styles.itemSubtitle}>
                                          {`${run.detected_brand || ''} ${run.detected_year || ''}`.trim() || 'Detection pending'}
                                        </Text>
                                      </View>
                                      <TouchableOpacity 
                                        style={styles.dangerButton} 
                                        onPress={() => deleteRun(userDetails.profile?.id, run.id)}
                                      >
                                        <Text style={styles.dangerButtonText}>Delete</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          );

                        case 'referrals':
                          return (
                            <View style={styles.sectionContainer}>
                              <Text style={styles.sectionTitle}>{item.title}</Text>
                              <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Code:</Text>
                                  <Text style={styles.infoValue}>{userDetails.referral?.referral_code || '—'}</Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Balance:</Text>
                                  <Text style={styles.infoValue}>
                                    {userDetails.referral?.balance?.toFixed 
                                      ? userDetails.referral.balance.toFixed(2) 
                                      : userDetails.referral?.balance || '0'
                                    } GEL
                                  </Text>
                                </View>
                                <View style={styles.infoRowSeparator} />
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>Invites:</Text>
                                  <Text style={styles.infoValue}>{userDetails.referral?.referrals?.length || 0}</Text>
                                </View>
                              </View>
                            </View>
                          );

                        default:
                          return null;
                      }
                    }}
                  />
                ) : null}
              </View>
            )}
          </>
        ) : (
          <>
            {/* Withdrawal Status Filter */}
            <View style={styles.filterContainer}>
              <Text style={styles.filterLabel}>Filter by status:</Text>
              <View style={styles.filterButtons}>
                {['requested', 'approved', 'rejected', 'all'].map((status) => (
                  <TouchableOpacity 
                    key={status} 
                    style={[styles.filterButton, wStatus === status && styles.filterButtonActive]} 
                    onPress={() => setWStatus(status)}
                  >
                    <Text style={[styles.filterButtonText, wStatus === status && styles.filterButtonTextActive]}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Withdrawal Requests */}
            {wLoading ? (
              <View style={styles.loadingStateContainer}>
                <ActivityIndicator color="#1F2937" size="large" />
                <Text style={styles.loadingStateText}>Loading withdrawals...</Text>
              </View>
            ) : (
              <FlatList
                data={withdrawals}
                keyExtractor={(item) => String(item.id)}
                style={styles.listContainer}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={[styles.withdrawalCard, getWithdrawalBorderStyle(item.status)]}>
                    <View style={styles.withdrawalHeader}>
                      <View style={styles.withdrawalMainInfo}>
                        <Text style={styles.withdrawalName}>{item.full_name || 'Unknown User'}</Text>
                        <Text style={styles.withdrawalAmount}>{item.amount} GEL</Text>
                      </View>
                      <View style={[styles.withdrawalStatusBadge, getWithdrawalStatusStyle(item.status)]}>
                        <Text style={styles.withdrawalStatusText}>
                          {item.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.withdrawalInfo}>
                      <View style={styles.withdrawalInfoRow}>
                        <Text style={styles.withdrawalInfoLabel}>IBAN:</Text>
                        <Text style={styles.withdrawalInfoValue}>{item.iban || '—'}</Text>
                      </View>
                      <View style={styles.withdrawalInfoRow}>
                        <Text style={styles.withdrawalInfoLabel}>Bank:</Text>
                        <Text style={styles.withdrawalInfoValue}>{item.bank_name || '—'}</Text>
                      </View>
                      <View style={styles.withdrawalInfoRow}>
                        <Text style={styles.withdrawalInfoLabel}>Date:</Text>
                        <Text style={styles.withdrawalInfoValue}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    {item.status === 'requested' && (
                      <View style={styles.withdrawalActions}>
                        <TouchableOpacity style={styles.approveButton} onPress={() => approve(item.id)}>
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.rejectButton} onPress={() => reject(item.id)}>
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateText}>No withdrawals found</Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}

// Helper functions for withdrawal styling
const getWithdrawalBorderStyle = (status) => {
  const borderColors = {
    approved: '#10B981',
    rejected: '#EF4444',
    requested: '#F59E0B'
  };
  return { borderLeftColor: borderColors[status] || borderColors.requested };
};

const getWithdrawalStatusStyle = (status) => {
  const statusColors = {
    approved: '#10B981',
    rejected: '#EF4444',
    requested: '#F59E0B'
  };
  return { backgroundColor: statusColors[status] || statusColors.requested };
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
    paddingVertical: 12,
    paddingTop: 50,
    backgroundColor: '#1F2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  backButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
  },

  backButtonText: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },

  headerSpacer: {
    width: 80,
  },

  // Tab Navigation
  tabNavigation: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },

  tabButtonActive: {
    borderBottomColor: '#1F2937',
  },

  tabButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },

  tabButtonTextActive: {
    color: '#1F2937',
  },

  // Main Content
  mainContent: {
    flex: 1,
  },

  // Search
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1F2937',
  },

  searchButton: {
    height: 44,
    backgroundColor: '#1F2937',
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },

  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Lists
  listContainer: {
    flex: 1,
  },

  listContent: {
    padding: 20,
  },

  // User Items
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  userDetails: {
    flex: 1,
  },

  userUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  userFullName: {
    fontSize: 14,
    color: '#6B7280',
  },

  viewArrow: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },

  // User Details
  userDetailContainer: {
    flex: 1,
  },

  userDetailHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  backToListButton: {
    marginBottom: 8,
  },

  backToListText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },

  userDetailTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },

  detailsList: {
    flex: 1,
  },

  detailsContent: {
    padding: 20,
  },

  // Sections
  sectionContainer: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },

  // Info Cards
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  infoRowSeparator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16,
  },

  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    flex: 1,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 2,
    textAlign: 'right',
  },

  // Item Cards
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    overflow: 'hidden',
  },

  itemCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },

  itemInfo: {
    flex: 1,
    marginRight: 12,
  },

  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  itemSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Buttons
  dangerButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
  },

  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Filter
  filterContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },

  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  filterButton: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  filterButtonActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },

  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  // Withdrawal Cards
  withdrawalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  withdrawalMainInfo: {
    flex: 1,
  },

  withdrawalName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },

  withdrawalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
  },

  withdrawalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },

  withdrawalStatusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  withdrawalInfo: {
    marginBottom: 16,
  },

  withdrawalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },

  withdrawalInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  withdrawalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },

  withdrawalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },

  approveButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  rejectButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rejectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty States
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },

  emptySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 32,
    alignItems: 'center',
  },

  emptySectionText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Loading States
  loadingStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  loadingStateText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
});