import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, ScrollView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import carService from '../services/carService';
import { getUserLeaderboardRank, getLeaderboardRuns } from '../services/runService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// Small helpers for consistent display
const getBrandName = (car) => (car?.car_brands?.name || car?.moto_brands?.name || car?.custom_brand || '').toString();
const getModelName = (car) => (car?.car_models?.name || car?.moto_models?.name || car?.custom_model || '').toString();
const getYear = (car) => (car?.year ? `${car.year}` : '');
const getVehicleType = (car) => (car?.vehicle_type || '').toLowerCase();
const getCarTitle = (car) => {
  const brand = getBrandName(car);
  const model = getModelName(car);
  const year = getYear(car);
  return [brand, model, year].filter(Boolean).join(' ');
};

// Helpers to mirror MainScreen card info
const getVehicleTypeDisplay = (car, t) => {
  const vt = getVehicleType(car);
  if (vt === 'car') return t.car0100.split(' ')[0]; // shows 'Car'
  if (vt === 'motorcycle') return 'Moto';
  return car?.custom_vehicle_type || car?.vehicle_type || '';
};

const getCarDetailsText = (car) => {
  const parts = [];
  if (car.year) parts.push(`${car.year}`);
  const brand = getBrandName(car);
  const model = getModelName(car);
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  return parts.join(' ');
};

const getModificationsText = (car, t) => {
  if (!car.is_stock && car.modifications_comment) return car.modifications_comment;
  return t.noCarsComment || t.noComment || 'No comment';
};

const getCarImage = (car) => {
  if (car?.car_photos?.length > 0 && car.car_photos[0]?.photo_url) {
    return { uri: car.car_photos[0].photo_url };
  }
  return null;
};

const ProfileScreen = ({ route, navigation, selectedLanguage = 'georgian', goToCarProfile, onBack }) => {
  const { userId, username } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [cars, setCars] = useState([]);
  const [rankCar0100, setRankCar0100] = useState(null);
  const [rankCar100200, setRankCar100200] = useState(null);
  const [error, setError] = useState(null);
  const [entries0100, setEntries0100] = useState([]); // [{ run, rank }]
  const [entries100200, setEntries100200] = useState([]);
  const [entriesM0_60, setEntriesM0_60] = useState([]);
  const [entriesM60_124, setEntriesM60_124] = useState([]);

  // UI state for compact display
  const [leaderboardVehicle, setLeaderboardVehicle] = useState('car'); // 'car' | 'motorcycle'
  const [leaderboardRange, setLeaderboardRange] = useState('0-100');

  const texts = {
    georgian: {
      title: 'პროფილი',
      back: 'უკან',
      cars: 'მანქანები',
      leaderboard: 'ლიდერბორდი',
      car0100: 'მანქანა 0-100',
      car100200: 'მანქანა 100-200',
      noCars: 'ამ მომხმარებელს მანქანები არ აქვს დამატებული',
      noComment: 'კომენტარი არ არის',
      loading: 'იტვირთება...'
    },
    english: {
      title: 'Profile',
      back: 'Back',
      cars: 'Cars',
      leaderboard: 'Leaderboard',
      car0100: 'Car 0-100',
      car100200: 'Car 100-200',
      noCars: "This user hasn't added any cars yet",
      noComment: 'No comment',
      loading: 'Loading...'
    }
  };

  const t = texts[selectedLanguage] || texts.english;

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!userId) { setError('No user provided'); setLoading(false); return; }
      setLoading(true);
      try {
        const [userCars, r1, r2, board0100, board100200, boardM0_60, boardM60_124] = await Promise.all([
          // Use legacy helper which returns a plain array
          carService.getUserCarsLegacy(userId),
          getUserLeaderboardRank({ userId, vehicleType: 'car', range: '0-100' }).catch(() => null),
          getUserLeaderboardRank({ userId, vehicleType: 'car', range: '100-200' }).catch(() => null),
          getLeaderboardRuns({ vehicleType: 'car', range: '0-100', limit: 1000 }).catch(() => []),
          getLeaderboardRuns({ vehicleType: 'car', range: '100-200', limit: 1000 }).catch(() => []),
          getLeaderboardRuns({ vehicleType: 'motorcycle', range: '0-100', limit: 1000 }).catch(() => []),
          getLeaderboardRuns({ vehicleType: 'motorcycle', range: '100-200', limit: 1000 }).catch(() => []),
        ]);
        if (!isMounted) return;
        // Enrich cars without photos by fetching full car details (to get car_photos)
        const enrichCars = async (list) => {
          const needs = (list || []).filter(c => !(c?.car_photos?.length > 0));
          if (needs.length === 0) return list;
          try {
            const detailed = await Promise.all(
              needs.map(async (c) => {
                try {
                  const full = await carService.getCarWithOwner(c.id);
                  return { ...c, ...(full || {}) };
                } catch (_) { return c; }
              })
            );
            const byId = new Map(detailed.map(c => [c.id, c]));
            return (list || []).map(c => byId.get(c.id) || c);
          } catch (_) {
            return list;
          }
        };
        const enriched = await enrichCars(userCars || []);
        setCars(enriched || []);
        setRankCar0100(r1);
        setRankCar100200(r2);

        // Build car title map for nicer labels
        const carTitleMap = new Map();
        (userCars || []).forEach(c => {
          const title = [
            (c?.car_brands?.name || c?.moto_brands?.name || c?.custom_brand || ''),
            (c?.car_models?.name || c?.moto_models?.name || c?.custom_model || ''),
            (c?.year || '')
          ].filter(Boolean).join(' ');
          if (c?.id) carTitleMap.set(c.id, title || `Car ${c.id}`);
        });

        // Compute all entries for this user with ranks
        const mapEntries = (board) => {
          return (board || [])
            .map((run, idx) => ({ run, rank: idx + 1 }))
            .filter(({ run }) => String(run.user_id) === String(userId));
        };
        const e0100 = mapEntries(board0100).map(e => ({
          ...e,
          carTitle: carTitleMap.get(e.run.car_id) || `Car ${e.run.car_id}`,
        }));
        const e100200 = mapEntries(board100200).map(e => ({
          ...e,
          carTitle: carTitleMap.get(e.run.car_id) || `Car ${e.run.car_id}`,
        }));
        setEntries0100(e0100);
        setEntries100200(e100200);

        // Moto mapping (no car title — could map by car_id if shared; keep simple label)
        const m0_60 = (boardM0_60 || []).map((run, idx) => ({ run, rank: idx + 1 }))
          .filter(({ run }) => String(run.user_id) === String(userId))
          .map(e => ({ ...e, carTitle: carTitleMap.get(e.run.car_id) || `Moto ${e.run.car_id || ''}`.trim() }));
        const m60_124 = (boardM60_124 || []).map((run, idx) => ({ run, rank: idx + 1 }))
          .filter(({ run }) => String(run.user_id) === String(userId))
          .map(e => ({ ...e, carTitle: carTitleMap.get(e.run.car_id) || `Moto ${e.run.car_id || ''}`.trim() }));
        setEntriesM0_60(m0_60);
        setEntriesM60_124(m60_124);
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load profile');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [userId]);

  const renderCar = ({ item }) => {
    const imageSource = getCarImage(item);
    return (
      <TouchableOpacity
        style={styles.carItem}
        activeOpacity={0.7}
        onPress={() => {
          if (typeof goToCarProfile === 'function') {
            // Pass minimal id; App.goToCarProfile will fetch details if needed
            goToCarProfile({ id: item.id });
          }
        }}
      >
        {imageSource ? (
          <Image source={imageSource} style={styles.carImage} resizeMode="cover" />
        ) : (
          <View style={[styles.carImage, styles.placeholderContainer]}>
            <Ionicons name={getVehicleType(item) === 'motorcycle' ? 'bicycle-outline' : 'car-outline'} size={20} color="#ccc" />
          </View>
        )}
        <View style={styles.carInfo}>
          <Text style={styles.carTitle} numberOfLines={1}>{getCarTitle(item) || '—'}</Text>
          <Text style={styles.carDetails} numberOfLines={1}>{getCarDetailsText(item)}</Text>
          <Text style={styles.carType} numberOfLines={1}>{getVehicleTypeDisplay(item, t)}</Text>
          <Text style={styles.modificationsText} numberOfLines={2}>{getModificationsText(item, t)}</Text>
        </View>
        <View style={styles.carEditButton}>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation?.goBack) {
              navigation.goBack();
            } else if (typeof onBack === 'function') {
              onBack();
            }
          }}
        > 
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Profile summary */}
      <View style={styles.summary}>
        <View style={styles.avatar}><Text style={styles.avatarText}>@</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>@{username || 'user'}</Text>
          <View style={styles.rankRow}>
            <Ionicons name="trophy" size={16} color="#000" />
            <Text style={styles.rankTitle}>{t.leaderboard}</Text>
          </View>
          <View style={styles.rankBadges}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankLabel}>{t.car0100}</Text>
              <Text style={styles.rankValue}>{rankCar0100 ? `#${rankCar0100}` : '-'}</Text>
            </View>
            <View style={styles.rankBadge}>
              <Text style={styles.rankLabel}>{t.car100200}</Text>
              <Text style={styles.rankValue}>{rankCar100200 ? `#${rankCar100200}` : '-'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Cars */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t.cars}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#000" />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      ) : (cars?.length || 0) === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="car-outline" size={32} color="#999" />
          <Text style={styles.emptyText}>{t.noCars}</Text>
        </View>
      ) : (
        <FlatList
          data={cars}
          keyExtractor={(item) => item.id?.toString?.() || `${item.id}`}
          renderItem={renderCar}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Leaderboard entries (with switchers) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t.leaderboard}</Text>
      </View>

      {/* Vehicle switcher */}
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.switchBtn, leaderboardVehicle === 'car' && styles.switchBtnActive]}
          onPress={() => { setLeaderboardVehicle('car'); setLeaderboardRange('0-100'); }}
        >
          <Text style={[styles.switchText, leaderboardVehicle === 'car' && styles.switchTextActive]}>Car</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, leaderboardVehicle === 'motorcycle' && styles.switchBtnActive]}
          onPress={() => { setLeaderboardVehicle('motorcycle'); setLeaderboardRange('0-100'); }}
        >
          <Text style={[styles.switchText, leaderboardVehicle === 'motorcycle' && styles.switchTextActive]}>Moto</Text>
        </TouchableOpacity>
      </View>

      {/* Range switcher */}
      <View style={styles.switchRow}>
        {(leaderboardVehicle === 'car' ? ['0-100','100-200'] : ['0-100','100-200']).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.switchBtnSmall, leaderboardRange === r && styles.switchBtnActive]}
            onPress={() => setLeaderboardRange(r)}
          >
            <Text style={[styles.switchText, leaderboardRange === r && styles.switchTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Entries list for current selection */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {(() => {
          let list = [];
          if (leaderboardVehicle === 'car') {
            list = leaderboardRange === '0-100' ? entries0100 : entries100200;
          } else {
            // Motorcycle ranges align with tabs '0-100' and '100-200'
            list = leaderboardRange === '0-100' ? entriesM0_60 : entriesM60_124;
          }
          if (!list || list.length === 0) return (<Text style={{ color: '#000', opacity: 0.6 }}>-</Text>);
          return list.map(({ run, rank, carTitle }) => (
            <TouchableOpacity
              key={run.id}
              style={styles.entryRow}
              onPress={() => {
                if (goToCarProfile && run.car_id) {
                  goToCarProfile({ id: run.car_id });
                }
              }}
            >
              <Text style={styles.entryRank}>#{rank}</Text>
              <Text style={styles.entryText}>{carTitle} • {(run.best_elapsed_ms/1000).toFixed(2)}s</Text>
              <Ionicons name="chevron-forward" size={16} color="#999" />
            </TouchableOpacity>
          ));
        })()}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Container & Base Layout
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },

  // Profile Summary Section
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },

  username: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  rankTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginLeft: 8,
  },

  rankBadges: {
    flexDirection: 'row',
    gap: 12,
  },

  rankBadge: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    minWidth: 80,
    alignItems: 'center',
  },

  rankLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  rankValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Section Headers
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Car Item Styles
  carItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },

  carImage: {
    width: 80,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  carInfo: {
    flex: 1,
    paddingRight: 12,
  },

  carTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },

  carDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },

  carType: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  modificationsText: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
    lineHeight: 16,
  },

  carEditButton: {
    padding: 8,
  },

  // Loading and Empty States
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#ffffff',
  },

  loadingText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 12,
    fontWeight: '500',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#ffffff',
  },

  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Switch Controls
  switchRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },

  switchBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },

  switchBtnSmall: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },

  switchBtnActive: {
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  switchText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  switchTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // Entry Rows for Leaderboard
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2,
  },

  entryRank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
    minWidth: 44,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },

  entryText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  // Utility Styles
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  border: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  rounded: {
    borderRadius: 12,
  },

  spacingVertical: {
    marginVertical: 8,
  },

  spacingHorizontal: {
    marginHorizontal: 16,
  },
});
export default ProfileScreen;
