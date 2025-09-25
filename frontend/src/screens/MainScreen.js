import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions, 
  Image,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
  RefreshControl,
  Modal,
  Linking,
  Animated,
  Easing,
  AppState,
  Platform,

} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video } from 'expo-av';
import { authService, supabase } from '../services/supabaseClient';
import * as chatService from '../services/chatService';
import carService from '../services/carService';
import runService, { getLeaderboardBest, getLeaderboardRuns } from '../services/runService';
import eventService from '../services/eventService';
import locationService from '../services/locationService';
import { GEORGIAN_CITIES } from '../utils/georgianCities';
import {
  upsertUserProfile,
  getUserProfileLocation,
  updateAllUserCarsLocation,
  fetchUserProfilesByIds,
} from '../services/profileService';

// Use SafeAreaView from react-native-safe-area-context on all platforms

const { width, height } = Dimensions.get('window');

const isSmallDevice = width < 360;
const isMediumDevice = width < 400;

// Scaling helpers (function declarations are hoisted)
function scale(size) {
  return (width / 375) * size;
}

function verticalScale(size) {
  return (height / 812) * size;
}

function moderateScale(size, factor = 0.5) {
  return size + (scale(size) - size) * factor;
}

//

// Shallow change guards to prevent render loops from redundant setState
function arraysShallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    const aId = ai?.id ?? ai;
    const bId = bi?.id ?? bi;
    if (aId !== bId) return false;
  }
  return true;
}

const MainScreen = ({ selectedLanguage, setSelectedLanguage, user, profile, navigation, route, onLogout, goToAddCar, goToCarProfile, goToAddEvent, goToEventScreen, goToUploadResult, goToProfile, goToChatInbox, onTabChange = () => {}, isPreview = false }) => {
  // Use global QueryClient from App provider
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const NAV_HEIGHT = 56;
  const navSpacerHeight = NAV_HEIGHT + (insets?.bottom || 0);
  // Small buffer so last card doesn't touch the nav
  const bottomListPadding = 12;
  const [activeTab, setActiveTab] = useState('home');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Cars are derived from queries (avoid local state to prevent loops)
  const [vehicleFilter, setVehicleFilter] = useState('car'); // 'car' | 'motorcycle'
  // derive events loading from query flag
  const [refreshing, setRefreshing] = useState(false);
  // Dashboard UI state
  const [dashboardVehicle, setDashboardVehicle] = useState('car'); // 'car' | 'motorcycle'
  const [dashboardRange, setDashboardRange] = useState('0-100'); // '0-100' | '0-200'
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [signedUrlMap, setSignedUrlMap] = useState({});

  // Chat: unread total derived from query; in-app toast handled globally in App.js

  // Infinite Queries for pagination with better cache settings
  const {
    data: userCarsInfiniteData,
    isLoading: userCarsLoading,
    isFetchingNextPage: userCarsFetchingNextPage,
    hasNextPage: userCarsHasNextPage,
    fetchNextPage: userCarsFetchNextPage,
    refetch: refetchUserCars,
    error: userCarsError,
  } = useInfiniteQuery({
    queryKey: ['userCars', user?.id],
    queryFn: ({ pageParam = 0 }) => 
      user?.id ? carService.getUserCars({ userId: user.id, pageParam, limit: 20 }) : Promise.resolve({ data: [], nextPage: undefined, hasNextPage: false }),
    enabled: !!user?.id && !isPreview,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  const {
    data: allCarsInfiniteData,
    isLoading: allCarsLoading,
    isFetchingNextPage: allCarsFetchingNextPage,
    hasNextPage: allCarsHasNextPage,
    fetchNextPage: allCarsFetchNextPage,
    refetch: refetchAllCars,
    error: allCarsError,
  } = useInfiniteQuery({
    queryKey: ['allCars', vehicleFilter, locationFilterEnabled, userCityName, searchQuery, currentSortBy],
    queryFn: ({ pageParam = 0 }) => 
      carService.getAllCars({ 
        pageParam, 
        limit: 20, 
        vehicleType: vehicleFilter,
        city: locationFilterEnabled ? userCityName : null,
        searchQuery: searchQuery || '',
        sortBy: currentSortBy
      }),
    enabled: !isPreview,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  const { data: eventsData = { events: [] }, isLoading: eventsIsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const response = await eventService.getAllEvents();
      const events = response.events || [];
      const sortedEvents = [...events].sort((a, b) => (parseInt(b.interested_people) || 0) - (parseInt(a.interested_people) || 0));
      return { events: sortedEvents };
    },
    enabled: !isPreview,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  const { data: unreadTotal = 0, refetch: refetchUnread } = useQuery({
    queryKey: ['unreadTotal', user?.id],
    queryFn: async () => {
      const list = await chatService.listConversations();
      return (list || []).reduce((s, c) => s + (c.unread_count || 0), 0);
    },
    enabled: !!user?.id && !isPreview,
    staleTime: 2 * 60 * 1000, // 2 minutes - unread counts change more frequently
    cacheTime: 5 * 60 * 1000, // 5 minutes - keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  const { data: bestRunData, isLoading: bestRunLoading, refetch: refetchBest } = useQuery({
    queryKey: ['leaderboardBest', { v: dashboardVehicle, r: dashboardRange }],
    queryFn: () => getLeaderboardBest({ vehicleType: dashboardVehicle, range: dashboardRange }),
    enabled: activeTab === 'dashboard' && !isPreview,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  const { data: runsData = [], isLoading: runsLoading, refetch: refetchRuns } = useQuery({
    queryKey: ['leaderboardRuns', { v: dashboardVehicle, r: dashboardRange }],
    queryFn: () => getLeaderboardRuns({ vehicleType: dashboardVehicle, range: dashboardRange, limit: 50 }),
    enabled: activeTab === 'dashboard' && !isPreview,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
  });

  // Ensure leaderboard fetches immediately when user opens Dashboard or changes filters while there
  useEffect(() => {
    if (activeTab === 'dashboard' && !isPreview) {
      refetchBest();
      refetchRuns();
    }
  }, [activeTab, dashboardVehicle, dashboardRange, isPreview, refetchBest, refetchRuns]);

  // Removed refreshUnreadTotal function to prevent loops

  // Load last active tab on mount; also honor navigation param initialTab if provided
  useEffect(() => {
    if (isPreview) return; // do not mutate state during preview snapshot
    (async () => {
      try {
        const paramTab = route?.params?.initialTab;
        if (paramTab) {
          setActiveTab(paramTab);
          // clear the param to avoid loops when coming back again
          try { navigation?.setParams?.({ initialTab: undefined }); } catch (_) {}
          return;
        }
        const saved = await AsyncStorage.getItem('lastActiveTab');
        if (saved) setActiveTab(saved);
      } catch (_) {}
    })();
  }, [isPreview]);

  // Persist active tab so returning from another screen restores the previous section
  React.useEffect(() => {
    if (isPreview) return;
    (async () => {
      try { await AsyncStorage.setItem('lastActiveTab', activeTab); } catch (_) {}
    })();
  }, [activeTab, isPreview]);

  // Sync user's city/country based on current device location (user-scoped, not car-scoped)
  const locationSyncedRef = useRef(false);
  React.useEffect(() => {
    if (isPreview) return; // avoid side-effects during preview
    const syncUserLocation = async () => {
      if (locationSyncedRef.current) return;
      try {
        const { city, country, region } = await locationService.getCityCountry();
        

        if (city || country || region) {
          const payload = {
            city: city || null,
            country: country || null,
          };

          const res = await authService.updateUserProfile(payload);
          if (!res.success) {
            
          } else {
            if (payload.city) {
              setUserCityName(payload.city);
              setLocationFilterEnabled(true);
            }
            // Also mirror into public.user_profiles so queries can filter by owner city
            try {
              await upsertUserProfile({
                id: user.id,
                city: city || null,
                country: country || null,
                region: region || null,
              });
            } catch (mirrorErr) {}

            // NEW: also sync the detected city/country/region into all of this user's cars
            try {
              await updateAllUserCarsLocation(user.id, {
                city: city || null,
                country: country || null,
                region: region || null,
              });
            } catch (e2) {}
            locationSyncedRef.current = true;
          }
        } else {
          
        }
      } catch (e) {
        
      }
    };

    if (user?.id) {
      syncUserLocation();
    }
  }, [user?.id, isPreview]);
  // derive cars loading from query flags
  
  // Search and Sort states
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortModal, setShowSortModal] = useState(false);
  const [currentSortBy, setCurrentSortBy] = useState('newest'); // Default sort
  
  
  // Location filtering states
  const [userLocation, setUserLocation] = useState(null);
  const [userCity, setUserCity] = useState(null);
  const [userCityName, setUserCityName] = useState(null); // string for filtering
  const [locationFilterEnabled, setLocationFilterEnabled] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  // Owner city map removed
  // Profile location editor state
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const texts = {
    georgian: {
      headerTitle: 'აბა დამიდექი!', // უცვლელი
      home: 'მთავარი',
      events: 'ღონისძიებები',
      profile: 'პროფილი',
      dashboard: 'ლიდერბორდი',
      search: 'ძიება',
      username: 'მეტსახელი',
      firstName: 'სახელი',
      lastName: 'გვარი',
      email: 'ელ. ფოსტა',
      phone: 'ტელეფონი',
      age: 'ასაკი',
      password: 'პაროლი',
      changePassword: 'პაროლის შეცვლა',
      newPassword: 'ახალი პაროლი',
      confirmPassword: 'დაადასტურეთ პაროლი',
      cancel: 'გაუქმება',
      save: 'შენახვა',
      selectLanguage: 'ენის არჩევა',
      languageGeorgian: 'ქართული',
      languageEnglish: 'English',
      myProfile: 'ჩემი პროფილი',
      locationSectionTitle: 'მდებარეობა',
      selectGeorgianCity: 'ქალაქის არჩევა (საქართველო)',
      personalInfo: 'პირადი ინფორმაცია',
      settings: 'პარამეტრები',
      myCars: 'ჩემი მანქანები',
      noCarsAdded: 'მანქანები დამატებული არ არის',
      addNewCar: 'მანქანის დამატება',
      year: 'წელი',
      brand: 'მარკა',
      model: 'მოდელი',
      engineCapacity: 'ძრავის მოცულობა',
      horsepower: 'ცხენის ძალა',
      stock: 'სტოკი',
      nonStock: 'ნონ-სტოკი',
      modifications: 'მოდიფიკაციები',
      car: 'მანქანა',
      motorcycle: 'მოტოციკლეტი',
      liter: 'ლ',
      hp: 'ც.ძ',
      logout: 'გასვლა',
      logoutConfirm: 'დარწმუნებული ხართ, რომ გსურთ გამოსვლა?',
      yes: 'კი',
      no: 'არა',
      allCars: 'ყველა მანქანა',
      noCarsFound: 'მანქანები ვერ მოიძებნა',
      loadingCars: 'იტვირთება...',
      noComment: 'კომენტარი არ არის',
      searchPlaceholder: 'ძიება მარკით, მოდელით...',
      sortBy: 'დალაგება',
      newest: 'ყველაზე ახალი',
      oldest: 'ყველაზე ძველი',
      brandAZ: 'მარკა (ა-ჰ)',
      brandZA: 'მარკა (ჰ-ა)',
      yearNewest: 'წელი (ახალი)',
      yearOldest: 'წელი (ძველი)',
      engineCapacityHigh: 'ძრავის მოცულობა (მაღალი)',
      engineCapacityLow: 'ძრავის მოცულობა (დაბალი)',
      horsepowerHigh: 'ცხენის ძალა (მაღალი)',
      horsepowerLow: 'ცხენის ძალა (დაბალი)',
      stockFirst: 'პირველ რიგში სტოკი',
      nonStockFirst: 'პირველ რიგში ნონ-სტოკი',
      noSearchResults: 'ძიების შედეგები არ მოიძებნა',
      addEvent: 'დამატება',
      noEventsAdded: 'ღონისძიებები დამატებული არ არის',
      // Dashboard
      dashboardTitle: 'ლიდერბორდი',
      carTab: 'მანქანა',
      motoTab: 'მოტო',
      zeroToHundred: '0–100 კმ/სთ',
      zeroToTwoHundred: '100–200 კმ/სთ',
      uploadYourResult: 'ატვირთე შენი შედეგი',
      noRecords: 'ჩანაწერები ვერ მოიძებნა',
      carInfo: 'მანქანა',
      video: 'ვიდეო',
    },
    english: {
      headerTitle: "Let's Race!",
      home: 'Home',
      events: 'Events',
      profile: 'Profile',
      dashboard: 'Leaderboard',
      search: 'Search',
      username: 'Username',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      age: 'Age',
      password: 'Password',
      changePassword: 'Change Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      cancel: 'Cancel',
      save: 'Save',
      selectLanguage: 'Select Language',
      languageGeorgian: 'ქართული',
      languageEnglish: 'English',
      myProfile: 'My Profile',
      locationSectionTitle: 'Location',
      selectGeorgianCity: 'Select Georgian City',
      personalInfo: 'Personal Information',
      settings: 'Settings',
      myCars: 'My Cars',
      noCarsAdded: 'No cars added yet',
      addNewCar: 'Add New Car',
      year: 'Year',
      brand: 'Brand',
      model: 'Model',
      engineCapacity: 'Engine Capacity',
      horsepower: 'Horsepower',
      stock: 'Stock',
      nonStock: 'Non-Stock',
      modifications: 'Modifications',
      car: 'Car',
      motorcycle: 'Motorcycle',
      liter: 'L',
      hp: 'HP',
      logout: 'Logout',
      logoutConfirm: 'Are you sure you want to logout?',
      yes: 'Yes',
      no: 'No',
      allCars: 'All Cars',
      noCarsFound: 'No cars found',
      loadingCars: 'Loading...',
      noComment: 'No comment',
      searchPlaceholder: 'Search by brand, model...',
      sortBy: 'Sort By',
      newest: 'Newest',
      oldest: 'Oldest',
      brandAZ: 'Brand (A-Z)',
      brandZA: 'Brand (Z-A)',
      yearNewest: 'Year (Newest)',
      yearOldest: 'Year (Oldest)',
      engineCapacityHigh: 'Engine Capacity (High)',
      engineCapacityLow: 'Engine Capacity (Low)',
      horsepowerHigh: 'Horsepower (High)',
      horsepowerLow: 'Horsepower (Low)',
      stockFirst: 'Stock First',
      nonStockFirst: 'Non-Stock First',
      noSearchResults: 'No search results found',
      addEvent: 'Add Event',
      noEventsAdded: 'No events added yet',
      // Dashboard
      dashboardTitle: 'Leaderboard',
      carTab: 'Car',
      motoTab: 'Moto',
      zeroToHundred: '0–100 km/h',
      zeroToTwoHundred: '100–200 km/h',
      uploadYourResult: 'Upload your result',
      noRecords: 'No records yet',
      carInfo: 'Car Info',
      video: 'Video',
    }
  };
  
  
  const t = texts[selectedLanguage] || texts.english;

  // Sort options configuration
  const sortOptions = [
    { id: 'newest', label: t.newest, field: 'created_at', order: 'desc' },
    { id: 'oldest', label: t.oldest, field: 'created_at', order: 'asc' },
    { id: 'brandAZ', label: t.brandAZ, field: 'brand', order: 'asc' },
    { id: 'brandZA', label: t.brandZA, field: 'brand', order: 'desc' },
    { id: 'yearNewest', label: t.yearNewest, field: 'year', order: 'desc' },
    { id: 'yearOldest', label: t.yearOldest, field: 'year', order: 'asc' },
    { id: 'engineHigh', label: t.engineCapacityHigh, field: 'engine_capacity', order: 'desc' },
    { id: 'engineLow', label: t.engineCapacityLow, field: 'engine_capacity', order: 'asc' },
    { id: 'hpHigh', label: t.horsepowerHigh, field: 'horsepower', order: 'desc' },
    { id: 'hpLow', label: t.horsepowerLow, field: 'horsepower', order: 'asc' },
    { id: 'stockFirst', label: t.stockFirst, field: 'is_stock', order: 'desc' },
    { id: 'nonStockFirst', label: t.nonStockFirst, field: 'is_stock', order: 'asc' }
  ];

  // Data derivation from infinite query results with fallback
  const userCarsData = React.useMemo(() => {
    try {
      const data = userCarsInfiniteData?.pages?.flatMap(page => page?.data || []) || [];
      console.log('userCarsData derived:', data.length, 'items from', userCarsInfiniteData?.pages?.length || 0, 'pages');
      console.log('userCarsInfiniteData structure:', {
        hasData: !!userCarsInfiniteData,
        pagesCount: userCarsInfiniteData?.pages?.length || 0,
        firstPageData: userCarsInfiniteData?.pages?.[0]?.data?.length || 0,
        isLoading: userCarsLoading,
        isError: !!userCarsError
      });
      return data;
    } catch (error) {
      console.error('Error deriving userCarsData:', error);
      return [];
    }
  }, [userCarsInfiniteData, userCarsLoading, userCarsError]);

  const allCarsData = React.useMemo(() => {
    try {
      const data = allCarsInfiniteData?.pages?.flatMap(page => page?.data || []) || [];
      console.log('allCarsData derived:', data.length, 'items from', allCarsInfiniteData?.pages?.length || 0, 'pages');
      console.log('allCarsInfiniteData structure:', {
        hasData: !!allCarsInfiniteData,
        pagesCount: allCarsInfiniteData?.pages?.length || 0,
        firstPageData: allCarsInfiniteData?.pages?.[0]?.data?.length || 0,
        isLoading: allCarsLoading,
        isError: !!allCarsError
      });
      return data;
    } catch (error) {
      console.error('Error deriving allCarsData:', error);
      return [];
    }
  }, [allCarsInfiniteData, allCarsLoading, allCarsError]);

  // Fallback data restoration when returning from non-TanStack screens
  const [fallbackData, setFallbackData] = React.useState({
    userCars: [],
    allCars: [],
    events: []
  });

  // Store data as fallback when we have it
  React.useEffect(() => {
    if ((userCarsData && userCarsData.length > 0) || (allCarsData && allCarsData.length > 0)) {
      setFallbackData(prev => ({
        ...prev,
        userCars: (userCarsData && userCarsData.length > 0) ? userCarsData : prev.userCars,
        allCars: (allCarsData && allCarsData.length > 0) ? allCarsData : prev.allCars,
        events: (allEvents && allEvents.length > 0) ? allEvents : prev.events
      }));
    }
  }, [userCarsData, allCarsData, allEvents]);


  const handleVehicleFilterChange = (type) => {
    setVehicleFilter((prev) => (prev === type ? prev : type));
  };
  // Use fallback data when main data is empty - prioritize showing data immediately
  const effectiveUserCarsData = (userCarsData && userCarsData.length > 0) ? userCarsData : fallbackData.userCars;
  const effectiveAllCarsData = (allCarsData && allCarsData.length > 0) ? allCarsData : fallbackData.allCars;
  const effectiveEventsData = (allEvents && allEvents.length > 0) ? allEvents : fallbackData.events;

  // Immediate data availability check - if we have any data, show it right away
  const hasImmediateData = (effectiveUserCarsData && effectiveUserCarsData.length > 0) || 
                          (effectiveAllCarsData && effectiveAllCarsData.length > 0);

  // Debug logging for effective data
  React.useEffect(() => {
    console.log('Effective data state:', {
      effectiveUserCarsData: effectiveUserCarsData?.length || 0,
      effectiveAllCarsData: effectiveAllCarsData?.length || 0,
      effectiveEventsData: effectiveEventsData?.length || 0,
      userCarsData: userCarsData?.length || 0,
      allCarsData: allCarsData?.length || 0,
      allEvents: allEvents?.length || 0,
      fallbackUserCars: fallbackData.userCars?.length || 0,
      fallbackAllCars: fallbackData.allCars?.length || 0,
      fallbackEvents: fallbackData.events?.length || 0
    });
  }, [effectiveUserCarsData, effectiveAllCarsData, effectiveEventsData, userCarsData, allCarsData, allEvents, fallbackData]);

  // Helper: attach owner city from user_profiles when backend didn't include it
  const attachOwnerCities = async (cars) => {
    try {
      const missingCityUserIds = Array.from(new Set(
        (cars || [])
          .filter(c => !(c?.user_profiles?.city) && !(c?.owner?.city) && !(c?.users?.city) && !(c?.city))
          .map(c => c.user_id)
          .filter(Boolean)
      ));
      if (missingCityUserIds.length === 0) return cars;
      const data = await fetchUserProfilesByIds(missingCityUserIds);
      const cityMap = new Map((data || []).map(r => [r.id, r.city]));
      return cars.map(c => {
        // Handle user_profiles as object or array
        const ensureCity = (carObj, cityVal) => {
          if (Array.isArray(carObj.user_profiles)) {
            if (carObj.user_profiles.length === 0) carObj.user_profiles.push({});
            if (!carObj.user_profiles[0].city && cityVal) carObj.user_profiles[0].city = cityVal;
          } else {
            if (!carObj.user_profiles) carObj.user_profiles = {};
            if (!carObj.user_profiles.city && cityVal) carObj.user_profiles.city = cityVal;
          }
        };
        const mapped = cityMap.get(c.user_id);
        if (mapped) ensureCity(c, mapped);
        return c;
      });
    } catch (e) { return cars; }
  };

  // Helper to extract owner's city from various response shapes
const getOwnerCityRaw = (car) => {
  try {
    if (car?.user_profiles) {
      if (Array.isArray(car.user_profiles)) {
        const first = car.user_profiles.find(p => p && (p.city || p.username || p.id));
        if (first?.city) return first.city;
      } else if (car.user_profiles.city) {
        return car.user_profiles.city;
      }
    }
    return car?.owner?.city || car?.users?.city || car?.city || '';
  } catch {
    return '';
  }
};

  // Helper to extract owner's username robustly from various shapes
  const getOwnerUsername = (car) => {
    try {
      if (car?.user_profiles) {
        if (Array.isArray(car.user_profiles)) {
          const first = car.user_profiles.find(p => p && (p.username || p.id));
          if (first?.username) return first.username;
        } else if (car.user_profiles.username) {
          return car.user_profiles.username;
        }
      }
      return car?.owner?.username || car?.users?.username || car?.username || '';
    } catch {
      return '';
    }
  };

  // Helper: unique by car id
  const uniqueById = (arr) => {
    const seen = new Set();
    const out = [];
    for (const item of arr || []) {
      const key = item?.id || JSON.stringify(item ?? {});
      if (!seen.has(key)) { seen.add(key); out.push(item); }
    }
    return out;
  };

  // Helper: extract owner id from various shapes of car payloads
  const getOwnerId = (car) => (
    car?.user_id ||
    car?.userId ||
    car?.owner_id ||
    car?.owner?.id ||
    car?.users?.id ||
    null
  );

  // Derived lists to avoid setState loops
  const mergedAllCars = React.useMemo(() => {
    const base = Array.isArray(effectiveAllCarsData) ? effectiveAllCarsData : [];
    return uniqueById([...(base || []), ...(effectiveUserCarsData || [])]);
  }, [effectiveAllCarsData, effectiveUserCarsData]);

  const normalizedUserCity = React.useMemo(() => {
    const raw = userCityName || userCity?.name || '';
        const v = (raw || '').toString().trim();
        if (!v) return '';
    const found = GEORGIAN_CITIES.find(c => c.name.toLowerCase() === v.toLowerCase() || c.nameKa === v);
        return (found ? found.name : v).toLowerCase();
  }, [userCityName, userCity?.name]);

  const baseFilteredByType = React.useMemo(() => (
    (mergedAllCars || []).filter(c => (c.vehicle_type || '').toLowerCase() === vehicleFilter)
  ), [mergedAllCars, vehicleFilter]);

  const locationFilteredCars = React.useMemo(() => {
    // On Profile tab, never mix with global list: show only my own cars for selected type
    if (activeTab === 'profile') {
      const mine = (effectiveUserCarsData || []).filter(
        c => (c.vehicle_type || '').toLowerCase() === vehicleFilter
      );
      return mine.length > 0 ? mine : [];
    }
  
    if (!locationFilterEnabled || !normalizedUserCity) return baseFilteredByType;
  
    const norm = (raw) => {
      const v = (raw || '').toString().trim();
      if (!v) return '';
      const f = GEORGIAN_CITIES.find(
        cc => cc.name.toLowerCase() === v.toLowerCase() || cc.nameKa === v
      );
      return (f ? f.name : v).toLowerCase();
    };
  
    const filtered = baseFilteredByType.filter(
      car => norm(car.city || getOwnerCityRaw(car) || '') === normalizedUserCity
    );
  
    if (filtered.length === 0 && (effectiveUserCarsData?.length || 0) > 0) {
      const mine = (effectiveUserCarsData || []).filter(
        c => (c.vehicle_type || '').toLowerCase() === vehicleFilter
      );
      return mine.length > 0 ? mine : [];
    }
  
    return filtered;
  }, [baseFilteredByType, locationFilterEnabled, normalizedUserCity, effectiveUserCarsData, vehicleFilter, activeTab]);
  const filteredCars = React.useMemo(() => {
    try {
      const sq = (searchQuery || '').trim().toLowerCase();
      const base = Array.isArray(locationFilteredCars) ? locationFilteredCars : [];
  
      // Apply client-side search by brand/model/year/username
      const searched = sq
        ? base.filter((car) => {
            const brand = (car?.car_brands?.name || car?.moto_brands?.name || car?.brand || car?.custom_brand || '')
              .toString()
              .toLowerCase();
            const model = (car?.car_models?.name || car?.moto_models?.name || car?.model || car?.custom_model || '')
              .toString()
              .toLowerCase();
            const year = (car?.year || '').toString().toLowerCase();
            const uname = (getOwnerUsername?.(car) || car?.username || '').toString().toLowerCase();
  
            const haystack = `${brand} ${model} ${year} ${uname}`;
            return haystack.includes(sq);
          })
        : base;
  
      const sorted = sortCars(searched, currentSortBy);
      console.log(
        'filteredCars derived:',
        sorted.length,
        'items from',
        base.length,
        sq ? 'search filtered cars' : 'location filtered cars'
      );
      return sorted;
    } catch (e) {
      console.warn('filteredCars derivation failed:', e?.message || e);
      return [];
    }
  }, [locationFilteredCars, currentSortBy, searchQuery]);
  

  // Get user's current location
  const getUserLocation = async () => {
    setIsGettingLocation(true);
    try {
      const result = await locationService.getLocationWithFallback();
      
      if (result.location && result.city) {
        setUserLocation(result.location);
        setUserCity(result.city);
        
      } else {
        
      }
    } catch (error) {
      
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Toggle location-based filtering
  const toggleLocationFilter = () => {
    if (!locationFilterEnabled && !userCity) {
      // If enabling filter but no location detected, try to get location first
      getUserLocation().then(() => {
        setLocationFilterEnabled(true);
        // derived via memo
      });
    } else {
      const newFilterState = !locationFilterEnabled;
      setLocationFilterEnabled(newFilterState);
      // derived via memo
    }
  };

  // Apply location-based filtering
 const applyLocationFilter = () => {};
// Events data derivation (no more state syncing)
const allEvents = React.useMemo(() => {
  return (eventsData && eventsData.events) || [];
}, [eventsData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'home') {
        await Promise.all([refetchAllCars(), refetchUserCars()]);
      } else if (activeTab === 'events') {
        await refetchEvents();
      } else if (activeTab === 'profile') {
        await refetchUserCars();
      }
    } finally {
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    // Prime queries cautiously: only refetch if caches look empty to avoid visual refresh
    if (user?.id && !isPreview) {
      const hasCars = (userCarsData && userCarsData.length > 0) || (allCarsData && allCarsData.length > 0)
      const hasEvents = (allEvents && allEvents.length > 0)
      if (!hasCars || !hasEvents) {
        if (!hasCars) {
          refetchUserCars()
          refetchAllCars()
        }
        if (!hasEvents) {
          refetchEvents()
        }
        refetchUnread()
      }
    }
    // No per-car location; user location handled via getCityCountry and metadata
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Track if component is mounted to prevent refetching on unmount
  const isMountedRef = useRef(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [hasEverLoadedData, setHasEverLoadedData] = useState(false);
  
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Track when initial data is loaded
  useEffect(() => {
    if ((effectiveAllCarsData && effectiveAllCarsData.length > 0) || (effectiveUserCarsData && effectiveUserCarsData.length > 0)) {
      setInitialDataLoaded(true);
      setHasEverLoadedData(true);
    } else if (activeTab === 'home' && !userCarsLoading && !allCarsLoading) {
      // If we're on home tab and not loading, but have no data, reset initialDataLoaded
      setInitialDataLoaded(false);
    }
  }, [effectiveAllCarsData, effectiveUserCarsData, activeTab, userCarsLoading, allCarsLoading]);

  // Add a more aggressive refetch when returning to home tab
  useEffect(() => {
    if (activeTab === 'home' && user?.id && isMountedRef.current) {
      console.log('Home tab activated, ensuring data is loaded...');
      console.log('Current data state:', {
        userCarsData: userCarsData?.length || 0,
        allCarsData: allCarsData?.length || 0,
        effectiveUserCarsData: effectiveUserCarsData?.length || 0,
        effectiveAllCarsData: effectiveAllCarsData?.length || 0,
        fallbackUserCars: fallbackData.userCars?.length || 0,
        fallbackAllCars: fallbackData.allCars?.length || 0
      });
      
      // Check if we have data, if not, refetch immediately
      if ((!effectiveAllCarsData || effectiveAllCarsData.length === 0) && (!effectiveUserCarsData || effectiveUserCarsData.length === 0)) {
        console.log('No data found, refetching immediately...');
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            // Just refetch without invalidating cache to preserve existing data
            Promise.all([
              refetchUserCars(),
              refetchAllCars(),
              refetchEvents(),
              refetchUnread()
            ]).catch(error => {
              console.warn('Error refetching data on home activation:', error);
            });
          }
        }, 100);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [activeTab, user?.id, effectiveAllCarsData, effectiveUserCarsData, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread, queryClient]);

  // Refetch data when activeTab changes to home to prevent blank screen (rate-limited)
  useEffect(() => {
    if (activeTab === 'home' && user?.id && isMountedRef.current) {
      const now = Date.now();
      const timeSinceLastRefetch = now - lastRefetchTimeRef.current;
      
      // Only refetch if we haven't refetched recently and don't have data
      if (timeSinceLastRefetch > REFETCH_COOLDOWN && 
          ((!effectiveUserCarsData || effectiveUserCarsData.length === 0) || 
           (!effectiveAllCarsData || effectiveAllCarsData.length === 0))) {
        console.log('Home tab active, refetching data...');
        lastRefetchTimeRef.current = Date.now();
        
        // Add a small delay to prevent race conditions with other screens
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            refetchUserCars();
            refetchAllCars();
            refetchEvents();
            refetchUnread();
          }
        }, 100);
        
        return () => clearTimeout(timeoutId);
  } else {
        console.log('Skipping tab change refetch - data available or cooldown active');
      }
    }
  }, [activeTab, user?.id, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread, effectiveUserCarsData, effectiveAllCarsData]);

  // Additional refetch when data becomes empty (e.g., returning from ChatInboxScreen)
  useEffect(() => {
    if (activeTab === 'home' && user?.id && isMountedRef.current && 
        (!effectiveAllCarsData || effectiveAllCarsData.length === 0) && (!effectiveUserCarsData || effectiveUserCarsData.length === 0) && 
        !allCarsLoading && !userCarsLoading) {
      console.log('Data is empty, refetching...');
      console.log('Empty data state:', {
        effectiveAllCarsData: effectiveAllCarsData?.length || 0,
        effectiveUserCarsData: effectiveUserCarsData?.length || 0,
        allCarsLoading,
        userCarsLoading
      });
      
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          // Force refetch all data with more aggressive approach
          console.log('Force refetching all data...');
          Promise.all([
            refetchUserCars(),
            refetchAllCars(),
            refetchEvents(),
            refetchUnread()
          ]).then(() => {
            console.log('Refetch completed');
          }).catch(error => {
            console.warn('Error refetching data:', error);
          });
        }
      }, 200);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab, user?.id, effectiveAllCarsData, effectiveUserCarsData, allCarsLoading, userCarsLoading, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread]);

  // Refetch data when app comes back to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active' && activeTab === 'home' && user?.id && isMountedRef.current) {
        console.log('App became active, refetching data...');
        refetchUserCars();
        refetchAllCars();
        refetchEvents();
        refetchUnread();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [activeTab, user?.id, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread]);

  // Force refresh when returning from other screens (rate-limited approach)
  const lastRefetchTimeRef = useRef(0);
  const REFETCH_COOLDOWN = 3000; // 3 seconds cooldown between refetches
  
  useEffect(() => {
    if (activeTab === 'home' && user?.id && isMountedRef.current) {
      console.log('Home tab focused, checking data integrity...');
      
      const now = Date.now();
      const timeSinceLastRefetch = now - lastRefetchTimeRef.current;
      
      // Only refetch if we haven't refetched recently (rate limiting protection)
      if (timeSinceLastRefetch > REFETCH_COOLDOWN) {
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            console.log('Force refreshing data on home focus...');
            lastRefetchTimeRef.current = Date.now();
            
            // Only refetch if we don't have data
            if ((!effectiveUserCarsData || effectiveUserCarsData.length === 0) || 
                (!effectiveAllCarsData || effectiveAllCarsData.length === 0)) {
              console.log('No data available, refetching without invalidating cache...');
              
              // Just refetch without invalidating cache to preserve existing data
              Promise.all([
                refetchUserCars(),
                refetchAllCars(),
                refetchEvents(),
                refetchUnread()
              ]).then(() => {
                console.log('Home focus refetch completed');
              }).catch(error => {
                console.warn('Error in home focus refetch:', error);
              });
            } else {
              console.log('Data already available, skipping refetch to avoid rate limiting');
            }
          }
        }, 1000); // Longer delay to ensure we're fully back on home tab
        
        return () => clearTimeout(timeoutId);
      } else {
        console.log(`Skipping refetch due to cooldown (${Math.round((REFETCH_COOLDOWN - timeSinceLastRefetch) / 1000)}s remaining)`);
      }
    }
  }, [activeTab, user?.id, queryClient, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread, effectiveUserCarsData, effectiveAllCarsData]);

  // Emergency fallback: If we have no data after 5 seconds, force a complete refresh (rate-limited)
  useEffect(() => {
    if (activeTab === 'home' && user?.id && isMountedRef.current) {
      const emergencyTimeout = setTimeout(() => {
        if (isMountedRef.current && 
            (!effectiveUserCarsData || effectiveUserCarsData.length === 0) && 
            (!effectiveAllCarsData || effectiveAllCarsData.length === 0) &&
            !userCarsLoading && !allCarsLoading) {
          
          const now = Date.now();
          const timeSinceLastRefetch = now - lastRefetchTimeRef.current;
          
          // Only do emergency refresh if we haven't refetched recently
          if (timeSinceLastRefetch > REFETCH_COOLDOWN) {
            console.log('EMERGENCY: No data after 5 seconds, forcing complete refresh...');
            lastRefetchTimeRef.current = Date.now();
            
            // Clear all caches and force fresh data
            queryClient.clear();
            
            // Force refetch everything
            Promise.all([
              refetchUserCars(),
              refetchAllCars(),
              refetchEvents(),
              refetchUnread()
            ]).then(() => {
              console.log('Emergency refresh completed');
            }).catch(error => {
              console.warn('Error in emergency refresh:', error);
            });
          } else {
            console.log('Emergency refresh skipped due to cooldown');
          }
        }
      }, 5000); // Increased to 5 seconds to reduce frequency
      
      return () => clearTimeout(emergencyTimeout);
    }
  }, [activeTab, user?.id, effectiveUserCarsData, effectiveAllCarsData, userCarsLoading, allCarsLoading, queryClient, refetchUserCars, refetchAllCars, refetchEvents, refetchUnread]);

  // Subscribe to message changes only to refresh unread totals. In-app toast is global in App.js.
  React.useEffect(() => {
    if (!user?.id) return;
    const ch = chatService.subscribeToConversationUpdates(() => {
      try { queryClient.invalidateQueries({ queryKey: ['unreadTotal', user?.id] }); } catch (_) {}
    });
    return () => { try { ch?.unsubscribe?.(); } catch (_) {} };
  }, [user?.id, queryClient]);

  // Load existing city from user_profiles on mount (for existing users)
  React.useEffect(() => {
    const loadProfileCity = async () => {
      if (!user?.id) return;
      try {
        const data = await getUserProfileLocation(user.id);
        if (data?.city) {
          setUserCityName(data.city);
          setLocationFilterEnabled(true);
          setEditCity(data.city || '');
          setEditCountry(data.country || '');
          setEditRegion(data.region || '');
        }
      } catch (_) {
        // ignore
      }
    };
    loadProfileCity();
  }, [user?.id]);

  // Handlers for profile location editor
  const handleDetectLocation = async () => {
    if (!user?.id) return;
    setIsGettingLocation(true);
    try {
      const { city, country, region } = await locationService.getCityCountry();
      if (!city && !country && !region) {
        Alert.alert('Location', 'Could not detect location.');
        return;
      }
      setEditCity(city || '');
      setEditCountry(country || '');
      setEditRegion(region || '');

      // Persist to Auth metadata
      const res = await authService.updateUserProfile({ city: city || null, country: country || null });
      if (!res.success) { }

      // Mirror to user_profiles
      await upsertUserProfile({
        id: user.id,
        city: city || null,
        country: country || null,
        region: region || null,
      });

      // Also update all cars owned by this user
try {
  await updateAllUserCarsLocation(user.id, {
    city: city || null,
    country: country || null,
    region: region || null,
  });
} catch (_) {}
      

      if (city) {
        setUserCityName(city);
        setLocationFilterEnabled(true);
        applyLocationFilter(true);
      }
      Alert.alert('Location', 'Location detected and saved.');
    } catch (e) {
      Alert.alert('Location', 'Detection failed.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!user?.id) return;
    if (!editCity && !editCountry && !editRegion) {
      Alert.alert('Location', 'Enter at least city or country.');
      return;
    }
    setSavingLocation(true);
    try {
      // Update Auth metadata
      const res = await authService.updateUserProfile({
        city: editCity || null,
        country: editCountry || null,
      });
      if (!res.success) {
        console.log('Auth metadata save failed:', res.error);
      }

      // Update profile table
     // Update profile table
await upsertUserProfile({
  id: user.id,
  city: editCity || null,
  country: editCountry || null,
  region: editRegion || null,
});
console.log('✅ Profile location saved');

try {
  await updateAllUserCarsLocation(user.id, {
    city: editCity || null,
    country: editCountry || null,
    region: editRegion || null,
  });
} catch (e) {
  console.log('Update cars location error:', e?.message || e);
}

      if (editCity) {
        setUserCityName(editCity);
        setLocationFilterEnabled(true);
        applyLocationFilter(true);
      }
      Alert.alert('Location', 'Location saved.');
    } catch (e) {
      console.log('Save location error:', e?.message || e);
      Alert.alert('Location', 'Save failed.');
    } finally {
      setSavingLocation(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'home') {
      refetchAllCars();
      refetchUserCars();
    } else if (activeTab === 'events') {
      refetchEvents();
    } else if (activeTab === 'profile') {
      refetchUserCars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id]);

  // Apply location and vehicle-type filtering when toggles/cars change
  // Removed redundant auto-filter effect; filtering handled in process effect and explicit actions

  // Chat unread total derived from query (no more state syncing)
  const chatUnreadTotal = unreadTotal || 0;

  // Search functionality
  const handleSearch = (query) => {
    setSearchQuery(query);

    // Helper to normalize city consistently
    const normalizeCity = (raw) => {
      const v = (raw || '').toString().trim();
      if (!v) return '';
      const found = GEORGIAN_CITIES.find(c => c.name.toLowerCase() === v.toLowerCase() || c.nameKa === v);
      return (found ? found.name : v).toLowerCase();
    };

    // Compute base list respecting the location filter
    const getLocationFilteredList = (cars) => {
      let list = cars;
      if (locationFilterEnabled) {
        const targetCity = normalizeCity(userCityName || userCity?.name || '');
        if (targetCity) {
          list = (list || []).filter(car => normalizeCity(car.city || '') === targetCity);
        }
      }
      // Apply vehicle type filter
      list = (list || []).filter(car => (car.vehicle_type || '').toLowerCase() === vehicleFilter);
      return list;
    };

    const base = getLocationFilteredList(mergedAllCars);

    if (!query.trim()) return;

    const filtered = base.filter(car => {
      const brandName = (car.car_brands?.name || car.moto_brands?.name || car.custom_brand || '').toLowerCase();
      const modelName = (car.car_models?.name || car.moto_models?.name || car.custom_model || '').toLowerCase();
      const yearStr = car.year?.toString() || '';
      const engineStr = car.engine_capacity?.toString() || '';
      const hpStr = car.horsepower?.toString() || '';
      const typeStr = (car.vehicle_type || '').toLowerCase();
      const modificationStr = (car.modifications_comment || '').toLowerCase();
      const searchLower = query.toLowerCase();
      return (
        brandName.includes(searchLower) ||
        modelName.includes(searchLower) ||
        yearStr.includes(searchLower) ||
        engineStr.includes(searchLower) ||
        hpStr.includes(searchLower) ||
        typeStr.includes(searchLower) ||
        modificationStr.includes(searchLower)
      );
    });

    // no setState beyond searchQuery; list derives from memo
  };

  // Sort functionality (use function declaration so it's hoisted)
  function sortCars(cars, sortId) {
    const sortOption = sortOptions.find(option => option.id === sortId);
    if (!sortOption) return cars;

    const sorted = [...cars].sort((a, b) => {
      let aValue, bValue;

      switch (sortOption.field) {
        case 'brand':
          aValue = (a.car_brands?.name || a.moto_brands?.name || a.custom_brand || '').toLowerCase();
          bValue = (b.car_brands?.name || b.moto_brands?.name || b.custom_brand || '').toLowerCase();
          break;
        case 'model':
          aValue = (a.car_models?.name || a.moto_models?.name || a.custom_model || '').toLowerCase();
          bValue = (b.car_models?.name || b.moto_models?.name || b.custom_model || '').toLowerCase();
          break;
        case 'year':
          aValue = parseInt(a.year) || 0;
          bValue = parseInt(b.year) || 0;
          break;
        case 'engine_capacity':
          aValue = parseFloat(a.engine_capacity) || 0;
          bValue = parseFloat(b.engine_capacity) || 0;
          break;
        case 'horsepower':
          aValue = parseInt(a.horsepower) || 0;
          bValue = parseInt(b.horsepower) || 0;
          break;
        case 'is_stock':
          aValue = a.is_stock ? 1 : 0;
          bValue = b.is_stock ? 1 : 0;
          break;
        case 'created_at':
          aValue = new Date(a.created_at || 0);
          bValue = new Date(b.created_at || 0);
          break;
        default:
          return 0;
      }

      if (sortOption.order === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return sorted;
  }

  const handleSort = (sortId) => {
    setCurrentSortBy(sortId);
    setShowSortModal(false);
    // derived via memo
  };

  // Helper to display milliseconds
  const displayBestTime = (ms) => (ms != null ? `${(ms / 1000).toFixed(2)}s` : 'N/A');

  // Dashboard data derived from queries (no more state syncing)
  const dashboardLoading = bestRunLoading || runsLoading;
  const dashboardBestRun = bestRunData || null;
  const dashboardRuns = runsData || [];

  const handleCarInfo = (carId) => {
    if (!carId) return;
    if (typeof goToCarProfile === 'function') {
      // Pass minimal object; screen can refetch by id
      goToCarProfile({ id: carId });
    } else if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('CarProfileScreen', { carId });
    }
  };

  const toggleShowVideo = async (runItem) => {
    if (!runItem) return;
    if (expandedRunId === runItem.id) {
      setExpandedRunId(null);
      return;
    }
    try {
      const cacheKey = runItem.id;
      let url = signedUrlMap[cacheKey];
      if (!url) {
        url = await runService.getSignedVideoUrl(runItem.video_bucket || 'dragy-uploads', runItem.video_path);
        setSignedUrlMap((prev) => ({ ...prev, [cacheKey]: url }));
      }
      setExpandedRunId(runItem.id);
    } catch (e) {
      Alert.alert(t.dashboardTitle, 'Could not load video');
    }
  };

  // DASHBOARD UI
  const renderDashboard = () => (
    <FlatList
      contentContainerStyle={styles.dashboardContainer}
      data={dashboardRuns}
      keyExtractor={(item) => item.id}
      refreshing={dashboardLoading}
      onRefresh={() => {
        refetchBest();
        refetchRuns();
      }}
      ListFooterComponent={<View style={{ height: navSpacerHeight }} />}
      ListHeaderComponent={(
        <View>
          <View style={styles.eventsHeader}>
            <Text style={styles.eventsTitle}>{t.dashboardTitle}</Text>
          </View>

          {/* Car / Moto tabs */}
          <View style={styles.dashTabsRow}>
            <TouchableOpacity
              onPress={() => setDashboardVehicle('car')}
              style={[styles.dashTabButton, dashboardVehicle === 'car' && styles.dashTabActive]}
            >
              <Text style={[styles.dashTabText, dashboardVehicle === 'car' && styles.dashTabTextActive]}>
                {t.carTab}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDashboardVehicle('motorcycle')}
              style={[styles.dashTabButton, dashboardVehicle === 'motorcycle' && styles.dashTabActive]}
            >
              <Text style={[styles.dashTabText, dashboardVehicle === 'motorcycle' && styles.dashTabTextActive]}>
                {t.motoTab}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 0-100 / 0-200 toggle */}
          <View style={styles.dashTabsRow}>
            <TouchableOpacity
              onPress={() => setDashboardRange('0-100')}
              style={[styles.dashTabButton, dashboardRange === '0-100' && styles.dashTabActive]}
            >
              <Text style={[styles.dashTabText, dashboardRange === '0-100' && styles.dashTabTextActive]}>
                {t.zeroToHundred}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDashboardRange('100-200')}
              style={[styles.dashTabButton, dashboardRange === '100-200' && styles.dashTabActive]}
            >
              <Text style={[styles.dashTabText, dashboardRange === '100-200' && styles.dashTabTextActive]}>
                {t.zeroToTwoHundred}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Single leaderboard card depending on current range */}
          <View style={styles.dashCard}>
            <View style={styles.dashCardHeader}>
              <Text style={styles.dashCardTitle}>
                {dashboardRange === '0-100' ? t.zeroToHundred : t.zeroToTwoHundred}
              </Text>
              <TouchableOpacity
                style={styles.dashUploadBtn}
                onPress={() => {
                  if (typeof goToUploadResult === 'function') {
                    goToUploadResult({ vehicleType: dashboardVehicle, range: dashboardRange, allowSwitcher: false, returnTab: 'dashboard' });
                  } else if (navigation && typeof navigation.navigate === 'function') {
                    navigation.navigate('UploadResultScreen', { vehicleType: dashboardVehicle, range: dashboardRange, allowSwitcher: false, selectedLanguage, returnTab: 'dashboard' });
                  } else {
                    Alert.alert(t.dashboardTitle, t.uploadYourResult);
                  }
                }}
              >
                <Ionicons name="cloud-upload" size={moderateScale(14)} color="white" />
                <Text style={styles.dashUploadBtnText}>{t.uploadYourResult}</Text>
              </TouchableOpacity>
            </View>

            {/* Best time summary */}
            <View style={styles.bestRow}>
              <View style={styles.bestPill}>
                <Ionicons name="speedometer" size={14} color="#fff" />
                <Text style={styles.bestPillText}>Best: {displayBestTime(dashboardBestRun?.best_elapsed_ms)}</Text>
              </View>
              {dashboardLoading ? (
                <Text style={{ fontSize: 12, color: '#888' }}>Loading...</Text>
              ) : null}
            </View>
          </View>
        </View>
      )}
      renderItem={({ item, index }) => (
        <View style={styles.runCard}>
          <View style={styles.runTopRow}>
            {/* Left: rank + main info */}
            <View style={styles.runLeft}>
              {(() => {
                const i = index;
                const bg = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#000';
                const color = i <= 2 ? '#000' : '#fff';
                return (
                  <View style={[styles.rankBadge, { backgroundColor: bg }]}> 
                    {i <= 2 ? (<Ionicons name="trophy" size={14} color={color} />) : null}
                    <Text style={{ color, fontWeight: '800', marginLeft: i <= 2 ? 4 : 0 }}>{index + 1}</Text>
                  </View>
                );
              })()}
              <View>
                <TouchableOpacity
                  onPress={() => {
                    const uid = item.user_id;
                    const uname = item.user_username;
                    if (goToProfile && uid) {
                      goToProfile({ userId: uid, username: uname });
                    }
                  }}
                >
                  <Text style={[styles.runUsername, { textDecorationLine: 'underline' }]}>
                    {item.user_username || '-'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.timeRow}>
                  <View style={styles.timePill}>
                    <Ionicons name="timer" size={12} color="#fff" />
                    <Text style={styles.timePillText}>{displayBestTime(item.best_elapsed_ms)}</Text>
                  </View>
                </View>
                <Text style={styles.runUploaded}>Uploaded: {new Date(item.created_at).toLocaleString()}</Text>
              </View>
            </View>

            {/* Right: actions */}
            <View style={styles.runActions}>
              <TouchableOpacity onPress={() => handleCarInfo(item.car_id)} style={styles.actionPrimary}>
                <Ionicons name="car" size={14} color="#fff" />
                <Text style={styles.actionPrimaryText}>{t.carInfo}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleShowVideo(item)} style={styles.actionSecondary}>
                <Ionicons name={expandedRunId === item.id ? 'chevron-up' : 'play'} size={14} color="#000" />
                <Text style={styles.actionSecondaryText}>{t.video}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Expandable video */}
          {expandedRunId === item.id && signedUrlMap[item.id] && (
            <View style={styles.expandContainer}>
              <Video
                source={{ uri: signedUrlMap[item.id] }}
                style={styles.videoPlayer}
                useNativeControls
                resizeMode="contain"
                shouldPlay={false}
              />
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={(
        <View style={styles.dashEmpty}>
          <Text style={styles.dashEmptyText}>{t.noRecords}</Text>
        </View>
      )}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Math.max(verticalScale(90), 90) }}
      ListFooterComponent={<View style={{ height: Math.max(verticalScale(80), 80) }} />}
    />
  );

  const handlePasswordChange = async () => {
    try {
      if (!newPassword || !confirmPassword) {
        Alert.alert('Error', 'Please fill all fields');
        return;
      }
      if (newPassword !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
      if (newPassword.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }
  
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
  
      Alert.alert('Success', 'Password updated successfully', [{
        text: 'OK',
        onPress: () => {
          setShowPasswordChange(false);
          setNewPassword('');
          setConfirmPassword('');
        }
      }]);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update password');
    }
  };

  const handleAddNewCar = () => {
    if (typeof goToAddCar === 'function') {
      goToAddCar();
    } else if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('AddCarScreen');
    } else {
      Alert.alert('Navigation Error', 'Unable to navigate to Add Car screen');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t.logout,
      t.logoutConfirm,
      [
        {
          text: t.no,
          style: 'cancel',
        },
        {
          text: t.yes,
          onPress: () => {
            if (onLogout) {
              onLogout();
            } else if (navigation) {
              navigation.navigate('HomeScreen');
            }
          },
        },
      ]
    );
  };

  const getDisplayName = (car) => {
    const brandName = car.car_brands?.name || car.moto_brands?.name || car.custom_brand || 'Unknown Brand';
    const modelName = car.car_models?.name || car.moto_models?.name || car.custom_model || 'Unknown Model';
    return `${car.year} ${brandName} ${modelName}`;
  };

  const getCarDetails = (car) => {
    const parts = [];
    
    if (car.engine_capacity) {
      parts.push(`${car.engine_capacity}${t.liter}`);
    }
    
    if (car.horsepower) {
      parts.push(`${car.horsepower} ${t.hp}`);
    }
    
    parts.push(car.is_stock ? t.stock : t.nonStock);
    
    return parts.join(' • ');
  };

  const getVehicleTypeDisplay = (car) => {
    if (car.vehicle_type === 'car') return t.car;
    if (car.vehicle_type === 'motorcycle') return t.motorcycle;
    return car.custom_vehicle_type || car.vehicle_type;
  };

  const getModificationsText = (car) => {
    if (!car.is_stock && car.modifications_comment) {
      return car.modifications_comment;
    }
    return t.noComment;
  };

  const getCarImage = (car) => {
    if (car.car_photos && car.car_photos.length > 0) {
      const firstPhoto = car.car_photos[0];
      
      if (firstPhoto.photo_url) {
        return { uri: firstPhoto.photo_url };
      }
    }
    
    return null;
  };

  const formatEventDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(selectedLanguage === 'georgian' ? 'ka-GE' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  const formatEventTime = (timeString) => {
    try {
      // Handle both full datetime and time-only strings
      const time = timeString.includes('T') ? new Date(timeString) : new Date(`2000-01-01T${timeString}`);
      return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return timeString;
    }
  };

  const getEventImage = (event) => {
    if (event.image_url) {
      
      // Supabase getPublicUrl returns full URL, so use it directly
      const imageUrl = event.image_url;
      
      return { uri: imageUrl };
    }
    console.log('No image URL found for event');
    return null;
  };

  const renderCarItem = ({ item: car }) => {
    const imageSource = getCarImage(car);
    const ownerId = getOwnerId(car);
    const ownerUsername = getOwnerUsername(car);
    
    return (
      <TouchableOpacity 
        style={styles.carItem}
        onPress={() => {
          if (goToCarProfile) {
            goToCarProfile(car);
          }
        }}
        activeOpacity={0.7}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.carImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.carImage, styles.placeholderContainer]}>
            <Ionicons 
              name={car.vehicle_type === 'motorcycle' ? 'bicycle-outline' : 'car-outline'} 
              size={moderateScale(30)} 
              color="#ccc" 
            />
          </View>
        )}
        <View style={styles.carInfo}>
          <Text style={styles.carTitle} numberOfLines={1}>
            {getDisplayName(car)}
          </Text>
          <Text style={styles.carDetails} numberOfLines={1}>
            {getCarDetails(car)}
          </Text>
          <Text style={styles.carType} numberOfLines={1}>
            {getVehicleTypeDisplay(car)}
          </Text>
          {!!ownerUsername && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                if (goToProfile && ownerId) {
                  goToProfile({ userId: ownerId, username: ownerUsername });
                }
              }}
            >
              <Text style={[styles.modificationsText, { color: '#007AFF' }]} numberOfLines={1}>
                @{ownerUsername}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={styles.modificationsText} numberOfLines={2}>
            {getModificationsText(car)}
          </Text>
        </View>
        <View style={styles.carEditButton}>
          <Ionicons name="chevron-forward" size={moderateScale(18)} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEventItem = ({ item: event }) => {
    const imageSource = getEventImage(event);
    const creatorUsername = event.user_profiles?.username || 'user';
    
    
    return (
      <TouchableOpacity 
        style={styles.eventCard}
        onPress={() => {
          goToEventScreen(event);
        }}
        activeOpacity={0.9}
      >
        <View style={styles.eventCoverContainer}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={styles.eventCoverImage}
              resizeMode="cover"
              onError={(error) => console.log('Image load error:', error)}
              onLoad={() => console.log('Image loaded successfully')}
            />
          ) : (
            <View style={[styles.eventCoverImage, styles.eventPlaceholderCover]}>
              <Ionicons 
                name="calendar-outline" 
                size={moderateScale(40)} 
                color="rgba(255,255,255,0.7)" 
              />
            </View>
          )}
          
          {/* Gradient Overlay */}
          <View style={styles.eventOverlay} />
          
          {/* Content Overlay */}
          <View style={styles.eventOverlayContent}>
            <Text style={styles.eventTitleOverlay} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.eventDateOverlay}>{formatEventDate(event.event_date)}</Text>
            <Text style={styles.eventTimeOverlay}>{formatEventTime(event.event_time)}</Text>
            <Text style={styles.eventLocationOverlay} numberOfLines={1}>{event.location}</Text>
            <View style={styles.eventBottomRow}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  const uid = event.user_id || event.user_profiles?.id;
                  if (goToProfile && uid) {
                    goToProfile({ userId: uid, username: creatorUsername });
                  }
                }}
              >
                <Text style={[styles.eventCreatorOverlay, { textDecorationLine: 'underline' }]} numberOfLines={1}>By @{creatorUsername}</Text>
              </TouchableOpacity>
              <View style={styles.interestedCountContainer}>
                <Ionicons name="people" size={moderateScale(14)} color="rgba(255,255,255,0.9)" />
                <Text style={styles.interestedCountText}>{event.interested_people || 0}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

const renderEvents = () => (
  <ScrollView 
    style={styles.eventsContainer} 
    showsVerticalScrollIndicator={false}
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    }
  >
    <View style={styles.eventsHeader}>
      <Text style={styles.eventsTitle}>{t.events}</Text>
      <TouchableOpacity 
        style={styles.addEventButton}
        onPress={() => {
          if (typeof goToAddEvent === 'function') {
            goToAddEvent();
          } else {
            console.log('goToAddEvent function not available');
          }
        }}
      >
        <Ionicons name="add" size={moderateScale(18)} color="white" />
        <Text style={styles.addEventText}>{t.addEvent}</Text>
      </TouchableOpacity>
    </View>
    
    {eventsIsLoading ? (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t.loadingCars}</Text>
      </View>
    ) : allEvents.length === 0 ? (
      <View style={styles.noEventsContainer}>
        <Ionicons name="calendar-outline" size={moderateScale(48)} color="#ccc" />
        <Text style={styles.noEventsText}>{t.noEventsAdded}</Text>
      </View>
    ) : (
      <FlatList
        data={allEvents}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      />
    )}
  </ScrollView>
);

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchInputContainer}>
        <Ionicons name="search" size={moderateScale(18)} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t.searchPlaceholder}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={handleSearch}
          autoFocus={showSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity 
            onPress={() => handleSearch('')}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={moderateScale(18)} color="#666" />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity 
        style={[styles.locationFilterButton, locationFilterEnabled && styles.locationFilterButtonActive]}
        onPress={toggleLocationFilter}
        disabled={isGettingLocation}
      >
        <Ionicons 
          name={locationFilterEnabled ? "location" : "location-outline"} 
          size={moderateScale(18)} 
          color={locationFilterEnabled ? "#fff" : "#000"} 
        />
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.sortButton}
        onPress={() => setShowSortModal(true)}
      >
        <Ionicons name="funnel-outline" size={moderateScale(18)} color="#000" />
      </TouchableOpacity>
    </View>
  );

  // Vehicle type toggle under search
  const renderVehicleToggle = () => (
    <View style={styles.vehicleToggleContainer}>
      <TouchableOpacity
        style={[styles.vehicleToggleButton, vehicleFilter === 'car' && styles.vehicleToggleActive]}
        onPress={() => handleVehicleFilterChange('car')}
      >
        <Text style={[styles.vehicleToggleText, vehicleFilter === 'car' && styles.vehicleToggleTextActive]}>
          {t.car}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.vehicleToggleButton, vehicleFilter === 'motorcycle' && styles.vehicleToggleActive]}
        onPress={() => handleVehicleFilterChange('motorcycle')}
      >
        <Text style={[styles.vehicleToggleText, vehicleFilter === 'motorcycle' && styles.vehicleToggleTextActive]}>
          {t.motorcycle}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSortModal = () => (
    <Modal visible={showSortModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.sortModalContent}>
          <Text style={styles.sortModalTitle}>{t.sortBy}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.sortOption,
                  currentSortBy === option.id && styles.selectedSortOption
                ]}
                onPress={() => handleSort(option.id)}
              >
                <Text style={[
                  styles.sortOptionText,
                  currentSortBy === option.id && styles.selectedSortOptionText
                ]}>
                  {option.label}
                </Text>
                {currentSortBy === option.id && (
                  <Ionicons name="checkmark" size={moderateScale(18)} color="#000" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity 
            style={styles.closeSortButton}
            onPress={() => setShowSortModal(false)}
          >
            <Text style={styles.closeSortButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMyCars = () => (
    <View style={styles.section}>
      {/* Profile Location Editor */}
      <View style={styles.profileLocationCard}>
        <Text style={styles.profileLocationTitle}>{t.locationSectionTitle}</Text>
        <View style={styles.profileLocationRow}>
        <Text style={styles.profileLocationLabel}>City</Text>
<View style={{ flex: 1, minHeight: 42, justifyContent: 'center' }}>
  <Text style={{ color: '#333', fontWeight: '600' }}>
    {editCity ? editCity : '—'}
  </Text>
</View>
<TouchableOpacity style={styles.chooseCityButton} onPress={() => setShowCityPicker(true)}>
  <Text style={styles.chooseCityButtonText}>{t.selectGeorgianCity}</Text>
</TouchableOpacity>
        </View>
        <View style={styles.profileLocationRow}>
          <Text style={styles.profileLocationLabel}>Country</Text>
          <TextInput
            style={styles.profileLocationInput}
            placeholder="Country"
            placeholderTextColor="#999"
            value={editCountry}
            onChangeText={setEditCountry}
          />
        </View>
        <View style={styles.profileLocationActions}>
          <TouchableOpacity style={styles.detectButton} onPress={handleDetectLocation} disabled={isGettingLocation}>
            <Ionicons name="location" size={moderateScale(16)} color="#fff" />
            <Text style={styles.detectButtonText}>{isGettingLocation ? 'Detecting...' : 'Detect my location'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveLocButton, (savingLocation) && styles.disabledButton]} onPress={handleSaveLocation} disabled={savingLocation}>
            <Text style={styles.saveLocButtonText}>{savingLocation ? 'Saving...' : t.save}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* City Picker Modal */}
      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.cityPickerContent}>
            <Text style={styles.cityPickerTitle}>{t.selectGeorgianCity}</Text>
            <FlatList
              data={[...GEORGIAN_CITIES].sort((a,b) => a.name.localeCompare(b.name))}
              keyExtractor={(item) => item.id?.toString() || item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.cityPickerItem}
                  onPress={() => {
                    setEditCity(item.name);
                    setShowCityPicker(false);
                  }}
                >
                  <Text style={styles.cityPickerItemText}>{item.name} • {item.nameKa}</Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
            <TouchableOpacity style={styles.cityPickerClose} onPress={() => setShowCityPicker(false)}>
              <Text style={styles.cityPickerCloseText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t.myCars}</Text>
        <TouchableOpacity 
          style={styles.addCarButton}
          onPress={handleAddNewCar}
        >
          <Ionicons name="add" size={moderateScale(18)} color="white" />
          <Text style={styles.addCarText}>{t.addNewCar}</Text>
        </TouchableOpacity>
      </View>
      
      {(!effectiveUserCarsData || effectiveUserCarsData.length === 0) ? (
        <View style={styles.noCarsContainer}>
          <Ionicons name="car-outline" size={moderateScale(48)} color="#ccc" />
          <Text style={styles.noCarsText}>{t.noCarsAdded}</Text>
        </View>
      ) : (
        <FlatList
          data={effectiveUserCarsData}
          renderItem={renderCarItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          ListFooterComponent={<View style={{ height: navSpacerHeight }} />}
        />
      )}
    </View>
  );

    // Header with logo, title and chat button
  const renderHeader = () => (
    <View style={styles.header}>
      <Image 
        source={require('../../assets/homescreen.png')} 
        style={styles.headerLogo}
        resizeMode="contain"
      />
      <Text style={styles.headerTitle}>{t?.headerTitle || 'Home'}</Text>
      <TouchableOpacity 
 // In the header chat button onPress:
onPress={async () => {
  if (typeof goToChatInbox === 'function') {
    goToChatInbox();
  } else if (typeof navigation?.navigate === 'function') {
    navigation.navigate('ChatInboxScreen');
  }
  
  // Refresh the actual count after a short delay
  setTimeout(() => refetchUnread(), 1000);
}}
  accessibilityLabel="Open Chat Inbox"
  style={styles.headerChatBtn}
>
  <Ionicons name="chatbubble-ellipses-outline" size={moderateScale(22)} color="#000" />
  {chatUnreadTotal > 0 && (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
      </Text>
    </View>
  )}
</TouchableOpacity>
    </View>
  );

  const renderAllCars = () => {
    console.log('renderAllCars called:', {
      filteredCars: filteredCars?.length || 0,
      allCarsLoading,
      userCarsLoading,
      effectiveAllCarsData: effectiveAllCarsData?.length || 0,
      effectiveUserCarsData: effectiveUserCarsData?.length || 0,
      hasEverLoadedData,
      initialDataLoaded
    });
    
    // Check if we have any cached data available
    const hasCachedData = (effectiveAllCarsData && effectiveAllCarsData.length > 0) || 
                         (effectiveUserCarsData && effectiveUserCarsData.length > 0) ||
                         (fallbackData.allCars && fallbackData.allCars.length > 0) ||
                         (fallbackData.userCars && fallbackData.userCars.length > 0);
    
    // If we have immediate data, don't show loading state
    const shouldShowLoading = (allCarsLoading || userCarsLoading) && 
                             filteredCars.length === 0 && 
                             !hasImmediateData;
    
    return (
    <View style={styles.homeContainer}>
      {renderSearchBar()}
      {renderVehicleToggle()}
      
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery ? `${t.search}: "${searchQuery}"` : t.allCars}
          </Text>
          <Text style={styles.resultCount}>
            ({filteredCars.length})
          </Text>
        </View>
        
        {shouldShowLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t.loadingCars}</Text>
          </View>
        ) : filteredCars.length === 0 ? (
          <View style={styles.noCarsContainer}>
            <Ionicons name="car-outline" size={moderateScale(48)} color="#ccc" />
            <Text style={styles.noCarsText}>
              {searchQuery ? t.noSearchResults : t.noCarsFound}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredCars}
            renderItem={renderCarItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            scrollEnabled={true}
            onEndReached={() => {
              if (allCarsHasNextPage && !allCarsFetchingNextPage) {
                allCarsFetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListFooterComponent={() => (
              <>
                {allCarsFetchingNextPage && (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading more cars...</Text>
                  </View>
                )}
                <View style={{ height: navSpacerHeight + bottomListPadding + 140 }} />
              </>
            )}
            // Add initial render optimization
            removeClippedSubviews={false}
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={10}
          />
        )}
      </View>
    </View>
  );
  };

  const renderProfile = () => (
    <ScrollView
      style={styles.profileContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <Text style={styles.profileName}>
          {profile?.first_name || user?.first_name || profile?.firstName || user?.firstName || 'User'}
        </Text>
        <Text style={styles.profileUsername}>@{profile?.username || user?.username || 'username'}</Text>
      </View>

      {/* Personal Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.personalInfo}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{t.firstName}</Text>
          <Text style={styles.value}>{profile?.first_name || user?.first_name || profile?.firstName || user?.firstName || 'N/A'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{t.lastName}</Text>
          <Text style={styles.value}>{profile?.last_name || user?.last_name || profile?.lastName || user?.lastName || 'N/A'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{t.email}</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{user?.email || 'N/A'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{t.phone}</Text>
          <Text style={styles.value}>{profile?.phone || user?.phone || 'N/A'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{t.age}</Text>
          <Text style={styles.value}>{profile?.age || user?.age || 'N/A'}</Text>
        </View>
      </View>

      {/* My Cars Section */}
      {renderMyCars()}
      {/* Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.settings}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t.selectLanguage}</Text>
          <View style={styles.languageToggle}>
            <TouchableOpacity
              style={[styles.langButton, selectedLanguage === 'georgian' && styles.activeLangButton]}
              style={[
                styles.langButton,
                selectedLanguage === 'georgian' && styles.activeLangButton
              ]}
              onPress={() => setSelectedLanguage('georgian')}
            >
              <Text style={[
                styles.langButtonText,
                selectedLanguage === 'georgian' && styles.activeLangButtonText
              ]}>
                GE
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.langButton,
                selectedLanguage === 'english' && styles.activeLangButton
              ]}
              onPress={() => setSelectedLanguage('english')}
            >
              <Text style={[
                styles.langButtonText,
                selectedLanguage === 'english' && styles.activeLangButtonText
              ]}>
                EN
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => setShowPasswordChange(true)}
        >
          <Text style={styles.settingLabel}>{t.changePassword}</Text>
          <Ionicons name="chevron-forward" size={moderateScale(18)} color="#666" />
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity 
          style={[styles.settingRow, styles.logoutRow]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutLabel}>{t.logout}</Text>
          <Ionicons name="log-out-outline" size={moderateScale(18)} color="#ff4757" />
        </TouchableOpacity>
      </View>
      <View style={{ height: navSpacerHeight + bottomListPadding - 50}} />
      {/* Password Change Modal */}
      {showPasswordChange && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t.changePassword}</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder={t.newPassword}
              placeholderTextColor="#999"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder={t.confirmPassword}
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPasswordChange(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalSaveButton}
                onPress={handlePasswordChange}
              >
                <Text style={styles.modalSaveText}>{t.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );

const renderContent = () => {
  switch (activeTab) {
    case 'home':
      return renderAllCars();
    case 'events':
      return renderEvents();
    case 'profile':
      return renderProfile();
    case 'dashboard':
      return renderDashboard();
    default:
      return (
        <View style={styles.defaultContent}>
          <Text style={styles.placeholderText}>{t.search}</Text>
        </View>
      );
  }
};

return (
  <SafeAreaView style={styles.container} edges={['bottom']}>
    
    <View style={{ paddingTop: insets?.top || 0 }}>
      {renderHeader()}
    </View>
    {/* Notification toast disabled: handled globally in App.js */}
    {false && !!notifications.length && showNotifPanel && (
      <Animated.View
        pointerEvents={showNotifPanel ? 'auto' : 'none'}
        style={[
          styles.toastWrap,
          {
            opacity: notifAnim,
            transform: [
              { 
                translateY: notifAnim.interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [-100, 0] 
                }) 
              },
            ],
          },
        ]}
      >
        <PanGestureHandler 
          onHandlerStateChange={onNotificationSwipe} 
          onGestureEvent={onNotificationSwipe}
          shouldCancelWhenOutside={false}
        >
          <Animated.View>
            <TouchableOpacity
              activeOpacity={0.95}
              style={styles.toast}
              onPress={() => {
                setShowNotifPanel(false);
                const item = notifications[0];
                if (item && typeof goToChatInbox === 'function') {
                  goToChatInbox();
                }
              }}
            >
              <View style={styles.toastIcon}>
                <Ionicons name="chatbubble" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toastUser}>@{notifications[0]?.username}</Text>
                <Text style={styles.toastMsg} numberOfLines={2}>
                  {notifications[0]?.content}
                </Text>
              </View>
              <Text style={styles.toastTime}>
                {new Date(notifications[0]?.created_at || Date.now()).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
              <TouchableOpacity
                style={styles.toastClose}
                onPress={(e) => {
                  e.stopPropagation();
                  setShowNotifPanel(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color="#666" />
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    )}

      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: insets?.bottom || 0 }]}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab('home')}
        >
          <Ionicons 
            name="home" 
            size={moderateScale(22)} 
            color={activeTab === 'home' ? 'black' : '#888'} 
          />
          <Text 
            style={[
              styles.navText, 
              activeTab === 'home' && styles.activeNavText
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t.home}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab('events')}
        >
          <Ionicons 
            name="calendar" 
            size={moderateScale(22)} 
            color={activeTab === 'events' ? 'black' : '#888'} 
          />
          <Text 
            style={[
              styles.navText, 
              activeTab === 'events' && styles.activeNavText
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t.events}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab('dashboard')}
        >
          <Ionicons 
            name="medal" 
            size={moderateScale(22)} 
            color={activeTab === 'dashboard' ? 'black' : '#888'} 
          />
          <Text 
            style={[
              styles.navText, 
              activeTab === 'dashboard' && styles.activeNavText
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t.dashboard}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab('profile')}
        >
          <Ionicons 
            name="person" 
            size={moderateScale(22)} 
            color={activeTab === 'profile' ? 'black' : '#888'} 
          />
          <Text 
            style={[
              styles.navText, 
              activeTab === 'profile' && styles.activeNavText
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t.profile}
          </Text>
        </TouchableOpacity>

      </View>

      {/* Sort Modal */}
      {renderSortModal()}
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  // Container & Base Layout
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  homeContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },

  headerLogo: {
    width: 36,
    height: 36,
  },

  headerTitle: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },

  headerChatBtn: {
    position: 'relative',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  // Badge Styles
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#000',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Notification Toast Styles
  toastWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },

  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  toastUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },

  toastMsg: {
    fontSize: 13,
    color: '#666',
    lineHeight: 16,
  },

  toastTime: {
    fontSize: 11,
    color: '#999',
    marginHorizontal: 8,
  },

  toastClose: {
    padding: 4,
  },

  // Search & Filter Styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  searchIcon: {
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    paddingVertical: 12,
  },

  clearButton: {
    padding: 4,
  },

  locationFilterButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
  },

  locationFilterButtonActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },

  sortButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  // Vehicle Toggle Styles
  vehicleToggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 4,
  },

  vehicleToggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },

  vehicleToggleActive: {
    backgroundColor: '#000',
  },

  vehicleToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  vehicleToggleTextActive: {
    color: '#fff',
  },

  // Section Styles
  section: {
    backgroundColor: '#fff',
    marginBottom: 8,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 15,
    margineLeft: 15,
  },

  resultCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },

  // Car Item Styles
  carItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#fff',
  },

  carImage: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  carInfo: {
    flex: 1,
    paddingRight: 8,
  },

  carTitle: {
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },

  modificationsText: {
    fontSize: 13,
    color: '#777',
    fontStyle: 'italic',
  },

  carEditButton: {
    padding: 8,
  },

  // Event Styles
  eventsContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  eventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  eventsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  addEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },

  addEventText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },

  eventCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  eventCoverContainer: {
    position: 'relative',
    height: 200,
  },

  eventCoverImage: {
    width: '100%',
    height: '100%',
  },

  eventPlaceholderCover: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },

  eventOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  eventOverlayContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },

  eventTitleOverlay: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  eventDateOverlay: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  eventTimeOverlay: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  eventLocationOverlay: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  eventBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  eventCreatorOverlay: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  interestedCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  interestedCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Dashboard Styles
  dashboardContainer: {
    backgroundColor: '#fafafa',
    paddingBottom: 100,
  },

  dashTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 4,
  },

  dashTabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },

  dashTabActive: {
    backgroundColor: '#000',
  },

  dashTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  dashTabTextActive: {
    color: '#fff',
  },

  dashCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },

  dashCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  dashCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  dashUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  dashUploadBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  bestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  bestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },

  bestPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Run Card Styles
  runCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  runTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  runLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
    minWidth: 40,
    justifyContent: 'center',
  },

  runUsername: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },

  timeRow: {
    marginBottom: 4,
  },

  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },

  timePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },

  runUploaded: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },

  runActions: {
    alignItems: 'flex-end',
  },

  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },

  actionPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  actionSecondaryText: {
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  expandContainer: {
    marginTop: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  videoPlayer: {
    width: '100%',
    height: 200,
  },

  dashEmpty: {
    padding: 32,
    alignItems: 'center',
  },

  dashEmptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },

  // Profile Styles
  profileContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  profileHeader: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },

  profileUsername: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },

  // Profile Location Editor
  profileLocationCard: {
    backgroundColor: '#fff',
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  profileLocationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },

  profileLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  profileLocationLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
    fontWeight: '500',
  },

  profileLocationInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginRight: 8,
  },

  chooseCityButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  chooseCityButtonText: {
    fontSize: 12,
    color: '#1a1a1a',
    fontWeight: '600',
  },

  profileLocationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },

  detectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },

  saveLocButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  saveLocButtonText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },

  disabledButton: {
    opacity: 0.5,
  },

  // Info Row Styles
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },

  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },

  value: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    textAlign: 'right',
  },

  // Settings Styles
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#fff',
  },

  settingLabel: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },

  languageToggle: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 2,
  },

  langButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },

  activeLangButton: {
    backgroundColor: '#000',
  },

  langButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  activeLangButtonText: {
    color: '#fff',
  },

  logoutRow: {
    borderBottomWidth: 0,
  },

  logoutLabel: {
    fontSize: 16,
    color: '#ff4757',
    fontWeight: '600',
  },

  // Car Management
  addCarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },

  addCarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },

  noCarsContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
  },

  noCarsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },

  debugText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },

  noEventsContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },

  noEventsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },

  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
  },

  loadingText: {
    fontSize: 16,
    color: '#666',
  },

  // Bottom Navigation
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    paddingHorizontal: 12,
  },

  navText: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },

  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  activeNavText: {
    color: '#000',
    fontWeight: '700',
  },

  // Modal Styles
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },

  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    width: width * 0.85,
    maxWidth: 400,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 20,
    textAlign: 'center',
  },

  modalInput: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f8f8f8',
    color: '#1a1a1a',
  },

  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  modalCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },

  modalSaveButton: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 12,
    marginLeft: 8,
    alignItems: 'center',
  },

  modalSaveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },

  // Sort Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  sortModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: height * 0.7,
  },

  sortModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 20,
  },

  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },

  selectedSortOption: {
    backgroundColor: '#f8f8f8',
  },

  sortOptionText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },

  selectedSortOptionText: {
    fontWeight: '700',
  },

  closeSortButton: {
    backgroundColor: '#000',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },

  closeSortButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // City Picker Modal
  cityPickerContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: height * 0.8,
  },

  cityPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 20,
  },

// City Picker Modal (continuing from where document cuts off)
cityPickerItem: {
  paddingHorizontal: 20,
  paddingVertical: 16,
  borderBottomWidth: 1,
  borderBottomColor: '#f0f0f0',
  backgroundColor: '#fff',
},

cityPickerItemText: {
  fontSize: 16,
  color: '#1a1a1a',
  fontWeight: '500',
},

cityPickerClose: {
  marginTop: 20,
  marginHorizontal: 20,
  paddingVertical: 16,
  alignItems: 'center',
  backgroundColor: '#f8f9fa',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#e9ecef',
},

cityPickerCloseText: {
  fontSize: 16,
  color: '#666',
  fontWeight: '600',
},

// Updated Header Chat Button with Badge
headerChatBtn: {
  position: 'relative',
  padding: 8,
  borderRadius: 8,
  backgroundColor: '#f5f5f5',
  borderWidth: 1,
  borderColor: '#e0e0e0',
},

// Updated Badge Styles
badge: {
  position: 'absolute',
  top: -2,
  right: -2,
  backgroundColor: '#ff4757',
  borderRadius: 10,
  minWidth: 20,
  height: 20,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: '#fff',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 5,
},

badgeText: {
  color: '#fff',
  fontSize: 11,
  fontWeight: '800',
  textAlign: 'center',
  lineHeight: 16,
},

// Updated Toast Styles
toastWrap: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 2000,
  paddingTop: 60, // Start below status bar
},

toast: {
  backgroundColor: '#fff',
  marginHorizontal: 16,
  borderRadius: 16,
  padding: 16,
  flexDirection: 'row',
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.25,
  shadowRadius: 16,
  elevation: 12,
  borderLeftWidth: 4,
  borderLeftColor: '#007AFF',
  minHeight: 70,
},

toastIcon: {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: '#007AFF',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 12,
},

toastUser: {
  fontSize: 15,
  fontWeight: '700',
  color: '#333',
  marginBottom: 2,
},

toastMsg: {
  fontSize: 13,
  color: '#666',
  lineHeight: 18,
  flex: 1,
},

toastTime: {
  fontSize: 11,
  color: '#999',
  fontWeight: '500',
  marginLeft: 8,
},

toastClose: {
  padding: 8,
  marginLeft: 4,
  borderRadius: 12,
  backgroundColor: '#f5f5f5',
},
});

export default MainScreen;