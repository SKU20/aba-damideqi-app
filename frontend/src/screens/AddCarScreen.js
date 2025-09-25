import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  Image,
  Alert,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  PermissionsAndroid,
  Dimensions
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import CarService from '../services/carService';
import { Ionicons } from '@expo/vector-icons';
import imageValidationService from '../services/imageValidationService';

// Responsive scaling helpers
const { width, height } = Dimensions.get('window');
function scale(size) {
  return (width / 375) * size;
}
function verticalScale(size) {
  return (height / 812) * size;
}
function moderateScale(size, factor = 0.5) {
  return size + (scale(size) - size) * factor;
}

const AddCarScreen = ({ goBackToMain, selectedLanguage, userId }) => {
  const queryClient = useQueryClient();

  // Form state
  const [vehicleType, setVehicleType] = useState('');
  const [year, setYear] = useState('');
  const [brand, setBrand] = useState('');
  const [brandId, setBrandId] = useState(null);
  const [model, setModel] = useState('');
  const [modelId, setModelId] = useState(null);
  const [engineVolume, setEngineVolume] = useState('');
  const [horsepower, setHorsepower] = useState('');
  const [isStock, setIsStock] = useState(true);
  const [nonStockComment, setNonStockComment] = useState('');
  const [photos, setPhotos] = useState([]);
  const [motorcycleType, setMotorcycleType] = useState('');
  const [driveType, setDriveType] = useState('');

  // Modal states
  const [showVehicleTypeModal, setShowVehicleTypeModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showMotorcycleTypeModal, setShowMotorcycleTypeModal] = useState(false);
  const [showDriveTypeModal, setShowDriveTypeModal] = useState(false);
  const [brandSearchText, setBrandSearchText] = useState('');
  const [modelSearchText, setModelSearchText] = useState('');

  // Static data
  const vehicleTypes = CarService.getVehicleTypes();
  const motorcycleTypes = CarService.getMotorcycleTypes();
  const driveTypes = CarService.getDriveTypes();

  // TanStack Query for brands
  const {
    data: allBrands = [],
    isLoading: isBrandsLoading,
    error: brandsError
  } = useQuery({
    queryKey: ['brands', vehicleType],
    queryFn: () => CarService.getBrands(vehicleType || 'car'),
    enabled: !!vehicleType, // Only run when vehicleType is selected
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    onError: (error) => {
      console.error('Error loading brands:', error);
      Alert.alert(t.error, 'Failed to load brands: ' + error.message);
    }
  });

  // TanStack Query for models
  const {
    data: allModels = [],
    isLoading: isModelsLoading,
    error: modelsError
  } = useQuery({
    queryKey: ['models', brandId, vehicleType],
    queryFn: () => CarService.getModelsByBrand(brandId, vehicleType || 'car'),
    enabled: !!brandId && !!vehicleType, // Only run when both are available
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    retry: 2,
    onError: (error) => {
      console.error('Error loading models:', error);
      Alert.alert(t.error, 'Failed to load models: ' + error.message);
    }
  });

  // Mutation for adding car
  const addCarMutation = useMutation({
    mutationFn: async (carData) => {
      const savedCar = await CarService.addCar(userId, carData);
      
      if (photos.length > 0) {
        await CarService.uploadCarPhotos(savedCar.id, userId, photos);
      }
      
      return savedCar;
    },
    onSuccess: () => {
      // Invalidate and refetch any car-related queries
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      queryClient.invalidateQueries({ queryKey: ['userCars', userId] });
      
      Alert.alert(t.success, t.carAddedSuccess, [
        { text: 'OK', onPress: () => goBackToMain() }
      ]);
    },
    onError: (error) => {
      // Use warn to avoid red error spam for expected validation messages
      console.warn('Save vehicle blocked:', error?.message || error);
      Alert.alert(t.error, error.message);
    }
  });

  const texts = {
    georgian: {
      title: 'მანქანის დამატება',
      vehicleType: 'ტრანსპორტის ტიპი',
      year: 'წელი',
      brand: 'მარკა',
      model: 'მოდელი',
      engineVolume: 'ძრავის მოცულობა (ლ)',
      horsepower: 'ცხენის ძალა',
      stockStatus: 'სტატუსი',
      stock: 'სტოკი',
      nonStock: 'ნონ-სტოკი',
      comment: 'კომენტარი',
      goBack: 'დაბრუნება',
      save: 'შენახვა',
      selectVehicleType: 'აირჩიეთ ტრანსპორტის ტიპი',
      selectBrand: 'აირჩიეთ მარკა',
      selectModel: 'აირჩიეთ მოდელი',
      search: 'ძებნა...',
      cancel: 'გაუქმება',
      nonStockCommentPlaceholder: 'აღწერეთ მოდიფიკაციები...',
      engineVolumeMax: '(მაქს. 8.0 ლ)',
      horsepowerPlaceholder: 'მიუთითეთ ცხენის ძალა',
      yearPlaceholder: 'მაგ: 2020',
      photos: 'ფოტოები',
      addPhoto: 'ფოტოს დამატება',
      takePhoto: 'ფოტოს გადაღება',
      chooseFromLibrary: 'გალერეიდან არჩევა',
      deletePhoto: 'ფოტოს წაშლა',
      location: 'მდებარეობა',
      getCurrentLocation: 'მიმდინარე მდებარეობა',
      selectCity: 'ქალაქის არჩევა',
      gettingLocation: 'მდებარეობა იღება...',
      locationError: 'მდებარეობის მიღება ვერ მოხერხდა',
      selectCityManually: 'ქალაქის ხელით არჩევა',
      loading: 'იტვირთება...',
      saving: 'ინახება...',
      uploadingPhotos: 'ფოტოები იტვირთება...',
      error: 'შეცდომა',
      success: 'წარმატებით',
      carAddedSuccess: 'მანქანა წარმატებით დაემატა',
      fillAllFields: 'გთხოვთ შეავსოთ ყველა სავალდებულო ველი',
      nonStockCommentRequired: 'ნონ-სტოკი მანქანისთვის კომენტარი აუცილებელია',
      loadingBrands: 'მარკები იტვირთება...',
      loadingModels: 'მოდელები იტვირთება...',
      motorcycleType: 'მოტოციკლეტის ტიპი',
      driveType: 'გადაცემის ტიპი',
      selectMotorcycleType: 'აირჩიეთ მოტოციკლეტის ტიპი',
      selectDriveType: 'აირჩიეთ გადაცემის ტიპი'
    },
    english: {
      title: 'Add New Vehicle',
      vehicleType: 'Vehicle Type',
      year: 'Year',
      brand: 'Brand',
      model: 'Model',
      engineVolume: 'Engine Volume (L)',
      horsepower: 'Horsepower',
      stockStatus: 'Status',
      stock: 'Stock',
      nonStock: 'Non-Stock',
      comment: 'Comment',
      goBack: 'Go Back',
      save: 'Save',
      selectVehicleType: 'Select Vehicle Type',
      selectBrand: 'Select Brand',
      selectModel: 'Select Model',
      search: 'Search...',
      cancel: 'Cancel',
      nonStockCommentPlaceholder: 'Describe modifications...',
      engineVolumeMax: '(max 8.0 L)',
      horsepowerPlaceholder: 'Enter horsepower',
      yearPlaceholder: 'e.g: 2020',
      photos: 'Photos',
      addPhoto: 'Add Photo',
      takePhoto: 'Take Photo',
      chooseFromLibrary: 'Choose from Library',
      deletePhoto: 'Delete Photo',
      location: 'Location',
      getCurrentLocation: 'Get Current Location',
      selectCity: 'Select City',
      gettingLocation: 'Getting location...',
      locationError: 'Failed to get location',
      selectCityManually: 'Select City Manually',
      loading: 'Loading...',
      saving: 'Saving...',
      uploadingPhotos: 'Uploading photos...',
      error: 'Error',
      success: 'Success',
      carAddedSuccess: 'Vehicle added successfully',
      fillAllFields: 'Please fill all required fields',
      nonStockCommentRequired: 'Comment is required for non-stock vehicles',
      loadingBrands: 'Loading brands...',
      loadingModels: 'Loading models...',
      motorcycleType: 'Motorcycle Type',
      driveType: 'Drive Type',
      selectMotorcycleType: 'Select Motorcycle Type',
      selectDriveType: 'Select Drive Type'
    }
  };
  
  const t = texts[selectedLanguage] || texts.english;

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ]);

        return (
          granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.READ_EXTERNAL_STORAGE'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.WRITE_EXTERNAL_STORAGE'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.warn(err);
        return false;
      }
    } else {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return cameraStatus === 'granted' && libraryStatus === 'granted';
    }
  };

  const filteredBrands = allBrands.filter(brandItem =>
    brandItem.name.toLowerCase().includes(brandSearchText.toLowerCase())
  );

  const filteredModels = allModels.filter(modelItem =>
    modelItem.name.toLowerCase().includes(modelSearchText.toLowerCase())
  );

  const handleVehicleTypeSelect = (type) => {
    setVehicleType(type);
    setBrand('');
    setBrandId(null);
    setModel('');
    setModelId(null);
    setShowVehicleTypeModal(false);
    
    // Clear any cached models when vehicle type changes
    queryClient.removeQueries({ queryKey: ['models'] });
  };

  const handleBrandSelect = (selectedBrand) => {
    setBrand(selectedBrand.name);
    setBrandId(selectedBrand.id);
    setModel('');
    setModelId(null);
    setBrandSearchText('');
    setShowBrandModal(false);
  };

  const handleModelSelect = (selectedModel) => {
    setModel(selectedModel.name);
    setModelId(selectedModel.id);
    setModelSearchText('');
    setShowModelModal(false);
  };

  const handleEngineVolumeChange = (text) => {
    // For motorcycles, accept cc (integer up to 3000). For cars, accept liters (decimal up to 8.0)
    if (vehicleType === 'motorcycle') {
      const numericValue = parseInt(text, 10);
      const isEmpty = text === '';
      const isValid = !isNaN(numericValue) && numericValue >= 0 && numericValue <= 3000;
      if (isEmpty || isValid) {
        setEngineVolume(text.replace(/[^0-9]/g, ''));
      }
    } else {
      // Support locales where decimal keypad uses ',' by normalizing to '.'
      const normalized = (text || '').replace(/,/g, '.');
      const numericValue = parseFloat(normalized);
      const isEmpty = normalized === '';
      const isValid = !isNaN(numericValue) && numericValue >= 0 && numericValue <= 8.0;
      if (isEmpty || isValid) {
        // Keep digits and at most one dot
        let cleaned = normalized.replace(/[^0-9.]/g, '');
        cleaned = cleaned.replace(/\.(?=.*\.)/g, '');
        setEngineVolume(cleaned);
      }
    }
  };

  // Try to resolve brand/model IDs from names if user somehow has the name but not the ID
  const resolveBrandModelIds = () => {
    let resolvedBrandId = brandId;
    let resolvedModelId = modelId;

    if (!resolvedBrandId && brand) {
      const foundBrand = allBrands.find(b => (b.name || '').toLowerCase() === brand.toLowerCase());
      if (foundBrand) resolvedBrandId = foundBrand.id;
    }

    if (!resolvedModelId && model) {
      const foundModel = allModels.find(m => (m.name || '').toLowerCase() === model.toLowerCase());
      if (foundModel) resolvedModelId = foundModel.id;
    }

    return { resolvedBrandId, resolvedModelId };
  };

  const validateForm = () => {
    const errors = [];

    if (!vehicleType) errors.push(selectedLanguage === 'georgian' ? 'აირჩიეთ ტრანსპორტის ტიპი' : 'Select vehicle type');

    // Require extra fields for motorcycles
    if (vehicleType === 'motorcycle') {
      if (!motorcycleType) {
        errors.push(selectedLanguage === 'georgian' ? 'აირჩიეთ მოტოციკლეტის ტიპი' : 'Select motorcycle type');
      }
      if (!driveType) {
        errors.push(selectedLanguage === 'georgian' ? 'აირჩიეთ გადაცემის ტიპი' : 'Select drive type');
      }
    }

    // Basic numeric validations
    const yearNum = parseInt(year, 10);
    if (!year || isNaN(yearNum) || yearNum < 1900 || yearNum > 2030) {
      errors.push(selectedLanguage === 'georgian' ? 'შეიყვანეთ სწორი წელი (1900-2030)' : 'Enter a valid year (1900-2030)');
    }

    if (vehicleType === 'motorcycle') {
      const cc = parseInt(engineVolume, 10);
      if (!engineVolume || isNaN(cc) || cc <= 0 || cc > 3000) {
        errors.push(selectedLanguage === 'georgian' ? 'ძრავის მოცულობა უნდა იყოს 1 - 3000 cc შორის' : 'Engine capacity must be between 1 and 3000 cc');
      }
    } else {
      const engNum = parseFloat(engineVolume);
      if (!engineVolume || isNaN(engNum) || engNum <= 0 || engNum > 8.0) {
        errors.push(selectedLanguage === 'georgian' ? 'ძრავის მოცულობა უნდა იყოს 0 - 8.0 ლ შორის' : 'Engine volume must be between 0 and 8.0 L');
      }
    }

    const hpNum = parseInt(horsepower, 10);
    if (!horsepower || isNaN(hpNum) || hpNum <= 0) {
      errors.push(selectedLanguage === 'georgian' ? 'ცხენის ძალა უნდა იყოს დადებითი რიცხვი' : 'Horsepower must be a positive number');
    }

    const { resolvedBrandId, resolvedModelId } = resolveBrandModelIds();
    if (!resolvedBrandId) errors.push(selectedLanguage === 'georgian' ? 'აირჩიეთ მარკა' : 'Select a brand');
    if (!resolvedModelId) errors.push(selectedLanguage === 'georgian' ? 'აირჩიეთ მოდელი' : 'Select a model');

    if (!isStock && !nonStockComment.trim()) {
      errors.push(selectedLanguage === 'georgian' ? 'ნონ-სტოკი მანქანისთვის კომენტარი აუცილებელია' : 'Comment is required for non-stock vehicles');
    }

    // Require at least one photo
    if (!Array.isArray(photos) || photos.length === 0) {
      errors.push(selectedLanguage === 'georgian' ? 'გთხოვთ დაამატოთ მინიმუმ ერთი ფოტო' : 'Please add at least one photo');
    }

    if (errors.length > 0) {
      Alert.alert(t.error, errors.join('\n'));
      return { valid: false, resolvedBrandId, resolvedModelId };
    }

    return { valid: true, resolvedBrandId, resolvedModelId };
  };

  const handleSave = async () => {
    if (addCarMutation.isPending) return;

    const { valid, resolvedBrandId, resolvedModelId } = validateForm();
    if (!valid) return;

    // Validate selected photos content using CLIP zero-shot via Hugging Face API
    try {
      if (vehicleType === 'car' || vehicleType === 'motorcycle') {
        const result = await imageValidationService.validateVehiclePhotos({ vehicleType, photos });
        if (!result.ok) {
          const engineMsg = vehicleType === 'car' ? `\n${selectedLanguage === 'georgian' ? 'ძრავის ფოტო აუცილებელია ერთჯერადად' : 'Exactly one engine photo is required'}` : '';
          const invalidMsg = result.invalid && result.invalid.length > 0
            ? `\n${selectedLanguage === 'georgian' ? 'არასწორი ფოტო(ები):' : 'Invalid photos:'} ${result.invalid.length}`
            : '';
          const main = selectedLanguage === 'georgian' ? 'ფოტოების ვალიდაცია ვერ გაიარა.' : 'Photo validation failed.';
          Alert.alert(
            selectedLanguage === 'georgian' ? 'შეცდომა' : 'Error',
            `${main}\n${result.reason || ''}${engineMsg}${invalidMsg}`.trim()
          );
          return;
        }
      }
    } catch (e) {
      // If validation throws (e.g., network), proceed without blocking to avoid false negatives
      console.warn('Image validation skipped:', e?.message || e);
    }

    // Client-side pre-check: enforce max 2 per type to avoid backend error and console spam
    try {
      if (vehicleType === 'car' || vehicleType === 'motorcycle') {
        const res = await CarService.getUserCars({ userId, limit: 100 });
        const current = (res?.data || []).filter(c => (c.vehicle_type || '').toLowerCase() === vehicleType).length;
        const limit = vehicleType === 'car' ? 2 : 2;
        if (current >= limit) {
          Alert.alert(
            t.error,
            vehicleType === 'car'
              ? `You can only add up to ${limit} cars`
              : `You can only add up to ${limit} motorcycles`
          );
          return;
        }
      }
    } catch (e) {
      // If pre-check fails (offline etc.), proceed and let backend validate
    }

    // Convert motorcycle cc to liters before sending to API
    const engineVolumeToSend = vehicleType === 'motorcycle'
      ? (engineVolume ? (parseInt(engineVolume, 10) / 1000).toFixed(1) : null)
      : (engineVolume || null);

    const carData = CarService.formatCarDataForAPI({
      vehicleType,
      year,
      brandId: resolvedBrandId,
      modelId: resolvedModelId,
      engineVolume: engineVolumeToSend,
      horsepower: horsepower || null,
      isStock,
      nonStockComment: !isStock ? nonStockComment : null,
      motorcycleType: vehicleType === 'motorcycle' ? motorcycleType : null,
      driveType: vehicleType === 'motorcycle' ? driveType : null,
    });

    addCarMutation.mutate(carData);
  };

  const handleYearChange = (text) => {
    // Allow only digits and up to 4 characters; defer range validation to submit
    const digitsOnly = (text || '').replace(/[^0-9]/g, '');
    if (digitsOnly.length <= 4) {
      setYear(digitsOnly);
    }
  };

  const showImagePicker = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(t.error, 'Camera and storage permissions are required to add photos.');
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t.cancel, t.takePhoto, t.chooseFromLibrary],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            openCamera();
          } else if (buttonIndex === 2) {
            openImageLibrary();
          }
        }
      );
    } else {
      Alert.alert(
        t.addPhoto,
        'Select photo source',
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.takePhoto, onPress: openCamera },
          { text: t.chooseFromLibrary, onPress: openImageLibrary }
        ]
      );
    }
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const newPhoto = {
        id: Date.now().toString(),
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: `camera_${Date.now()}.jpg`,
      };
      setPhotos(prev => [...prev, newPhoto]);
    }
  };

  const openImageLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map((asset, index) => ({
        id: Date.now().toString() + index,
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: `library_${Date.now()}_${index}.jpg`,
      }));
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const deletePhoto = (photoId) => {
    Alert.alert(
      t.deletePhoto,
      '',
      [
        { text: t.cancel, style: 'cancel' },
        { 
          text: t.deletePhoto, 
          style: 'destructive',
          onPress: () => setPhotos(prev => prev.filter(photo => photo.id !== photoId))
        }
      ]
    );
  };

  const renderPhotoItem = ({ item, index }) => (
    <View style={styles.photoItem}>
      <Image source={{ uri: item.uri }} style={styles.photoImage} />
      <TouchableOpacity
        style={styles.deletePhotoButton}
        onPress={() => deletePhoto(item.id)}
      >
        <Text style={styles.deletePhotoText}>×</Text>
      </TouchableOpacity>
      <View style={styles.photoOrder}>
        <Text style={styles.photoOrderText}>{index + 1}</Text>
      </View>
    </View>
  );

  const renderVehicleTypeModal = () => (
    <Modal visible={showVehicleTypeModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.selectVehicleType}</Text>
          <FlatList
            data={vehicleTypes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => handleVehicleTypeSelect(item.id)}
              >
                <Text style={styles.optionText}>
                  {selectedLanguage === 'georgian' ? item.name_ka : item.name_en}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => setShowVehicleTypeModal(false)}
          >
            <Text style={styles.cancelButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderBrandModal = () => (
    <Modal visible={showBrandModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.selectBrand}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t.search}
            value={brandSearchText}
            onChangeText={setBrandSearchText}
          />
          {isBrandsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000ff" />
              <Text style={styles.loadingText}>{t.loadingBrands}</Text>
            </View>
          ) : (
            <FlatList
              data={filteredBrands}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => handleBrandSelect(item)}
                >
                  <Text style={styles.optionText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => {
              setShowBrandModal(false);
              setBrandSearchText('');
            }}
          >
            <Text style={styles.cancelButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderModelModal = () => (
    <Modal visible={showModelModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.selectModel}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t.search}
            value={modelSearchText}
            onChangeText={setModelSearchText}
          />
          {isModelsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000ff" />
              <Text style={styles.loadingText}>{t.loadingModels}</Text>
            </View>
          ) : (
            <FlatList
              data={filteredModels}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => handleModelSelect(item)}
                >
                  <Text style={styles.optionText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => {
              setShowModelModal(false);
              setModelSearchText('');
            }}
          >
            <Text style={styles.cancelButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMotorcycleTypeModal = () => (
    <Modal visible={showMotorcycleTypeModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.selectMotorcycleType}</Text>
          <FlatList
            data={motorcycleTypes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setMotorcycleType(item.id);
                  setShowMotorcycleTypeModal(false);
                }}
              >
                <Text style={styles.optionText}>
                  {selectedLanguage === 'georgian' ? item.name_ka : item.name_en}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => setShowMotorcycleTypeModal(false)}
          >
            <Text style={styles.cancelButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderDriveTypeModal = () => (
    <Modal visible={showDriveTypeModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.selectDriveType}</Text>
          <FlatList
            data={driveTypes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setDriveType(item.id);
                  setShowDriveTypeModal(false);
                }}
              >
                <Text style={styles.optionText}>
                  {selectedLanguage === 'georgian' ? item.name_ka : item.name_en}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => setShowDriveTypeModal(false)}
          >
            <Text style={styles.cancelButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackToMain} style={styles.backButton}>
          <Text style={styles.backButtonText}>← {t.goBack}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
      </View>
      
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.vehicleType}</Text>
          <TouchableOpacity
            style={[styles.selector, !vehicleType && styles.placeholderSelector]}
            onPress={() => setShowVehicleTypeModal(true)}
          >
            <Text style={[styles.selectorText, !vehicleType && styles.placeholderText]}>
              {vehicleType ? 
                (vehicleType === 'car' ? 
                  (selectedLanguage === 'georgian' ? 'მანქანა' : 'Car') : 
                  (selectedLanguage === 'georgian' ? 'მოტოციკლეტი' : 'Motorcycle')
                ) : 
                t.selectVehicleType
              }
            </Text>
          </TouchableOpacity>
        </View>

        {vehicleType === 'motorcycle' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t.motorcycleType}</Text>
              <TouchableOpacity
                style={[styles.selector, !motorcycleType && styles.placeholderSelector]}
                onPress={() => setShowMotorcycleTypeModal(true)}
              >
                <Text style={[styles.selectorText, !motorcycleType && styles.placeholderText]}>
                  {motorcycleType ? 
                    motorcycleTypes.find(type => type.id === motorcycleType)?.[selectedLanguage === 'georgian' ? 'name_ka' : 'name_en'] :
                    t.selectMotorcycleType
                  }
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t.driveType}</Text>
              <TouchableOpacity
                style={[styles.selector, !driveType && styles.placeholderSelector]}
                onPress={() => setShowDriveTypeModal(true)}
              >
                <Text style={[styles.selectorText, !driveType && styles.placeholderText]}>
                  {driveType ? 
                    driveTypes.find(type => type.id === driveType)?.[selectedLanguage === 'georgian' ? 'name_ka' : 'name_en'] :
                    t.selectDriveType
                  }
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.year}</Text>
          <TextInput
            style={styles.textInput}
            value={year}
            onChangeText={handleYearChange}
            placeholder={t.yearPlaceholder}
            keyboardType="numeric"
            maxLength={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.brand}</Text>
          <TouchableOpacity
            style={[styles.selector, !brand && styles.placeholderSelector]}
            onPress={() => vehicleType && setShowBrandModal(true)}
            disabled={!vehicleType}
          >
            <Text style={[styles.selectorText, !brand && styles.placeholderText]}>
              {brand || t.selectBrand}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.model}</Text>
          <TouchableOpacity
            style={[styles.selector, !model && styles.placeholderSelector]}
            onPress={() => brandId && setShowModelModal(true)}
            disabled={!brandId}
          >
            <Text style={[styles.selectorText, !model && styles.placeholderText]}>
              {model || t.selectModel}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {vehicleType === 'motorcycle' 
              ? (selectedLanguage === 'georgian' ? 'ძრავის მოცულობა (cc)' : 'Engine Capacity (cc)')
              : t.engineVolume
            } {vehicleType === 'motorcycle' 
              ? (selectedLanguage === 'georgian' ? '(მაქს. 3000 cc)' : '(max 3000 cc)')
              : t.engineVolumeMax}
          </Text>
          <TextInput
            style={styles.textInput}
            value={engineVolume}
            onChangeText={handleEngineVolumeChange}
            placeholder={vehicleType === 'motorcycle' ? '600' : '2.0'}
            keyboardType={vehicleType === 'motorcycle' ? 'number-pad' : 'decimal-pad'}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.horsepower}</Text>
          <TextInput
            style={styles.textInput}
            value={horsepower}
            onChangeText={setHorsepower}
            placeholder={t.horsepowerPlaceholder}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.stockStatus}</Text>
          <View style={styles.radioGroup}>
            <TouchableOpacity
              style={[styles.radioOption, isStock && styles.radioOptionSelected]}
              onPress={() => setIsStock(true)}
            >
              <Text style={[styles.radioText, isStock && styles.radioTextSelected]}>
                {t.stock}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.radioOption, !isStock && styles.radioOptionSelected]}
              onPress={() => setIsStock(false)}
            >
              <Text style={[styles.radioText, !isStock && styles.radioTextSelected]}>
                {t.nonStock}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isStock && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.comment}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={nonStockComment}
              onChangeText={setNonStockComment}
              placeholder={t.nonStockCommentPlaceholder}
              multiline
              numberOfLines={4}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.photos}</Text>
          
          <TouchableOpacity 
            style={styles.addPhotoButton} 
            onPress={showImagePicker}
            disabled={photos.length >= 10}
          >
            <Text style={[
              styles.addPhotoText, 
              photos.length >= 10 && styles.disabledText
            ]}>
              + {t.addPhoto} ({photos.length}/10)
            </Text>
          </TouchableOpacity>

          {photos.length > 0 && (
            <View style={styles.photosContainer}>
              <FlatList
                data={photos}
                renderItem={renderPhotoItem}
                keyExtractor={(item) => item.id}
                numColumns={3}
                scrollEnabled={false}
                columnWrapperStyle={styles.photoRow}
              />
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, addCarMutation.isPending && styles.disabledButton]} 
          onPress={handleSave}
          disabled={addCarMutation.isPending}
        >
          {addCarMutation.isPending ? (
            <View style={styles.savingContainer}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.saveButtonText}>{t.saving}</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>{t.save}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {renderVehicleTypeModal()}
      {renderBrandModal()}
      {renderModelModal()}
      {renderMotorcycleTypeModal()}
      {renderDriveTypeModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(16),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },

  backButton: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(8),
    borderRadius: 6,
  },

  backButtonText: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontWeight: '500',
  },

  headerTitle: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: scale(20),
  },

  // Content Styles
  scrollContainer: {
    flex: 1,
  },

  content: {
    padding: scale(20),
    paddingBottom: verticalScale(40),
  },

  // Input Group Styles
  inputGroup: {
    marginBottom: verticalScale(24),
  },

  label: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#000000',
    marginBottom: verticalScale(8),
  },

  // Text Input Styles
  textInput: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    fontSize: moderateScale(16),
    backgroundColor: '#ffffff',
    color: '#000000',
  },

  textArea: {
    height: verticalScale(100),
    textAlignVertical: 'top',
  },

  // Selector Styles
  selector: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  placeholderSelector: {
    borderColor: '#cccccc',
  },

  selectorText: {
    fontSize: moderateScale(16),
    color: '#000000',
    flex: 1,
  },

  placeholderText: {
    color: '#999999',
  },

  // Radio Button Styles
  radioGroup: {
    flexDirection: 'row',
    gap: scale(12),
  },

  radioOption: {
    flex: 1,
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(20),
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  radioOptionSelected: {
    borderColor: '#000000',
    backgroundColor: '#000000',
  },

  radioText: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontWeight: '500',
  },

  radioTextSelected: {
    color: '#ffffff',
  },

  // Photo Styles
  addPhotoButton: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: verticalScale(20),
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginBottom: verticalScale(16),
  },

  addPhotoText: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontWeight: '500',
  },

  photosContainer: {
    marginTop: verticalScale(16),
  },

  photoRow: {
    justifyContent: 'space-between',
  },

  photoItem: {
    width: (width - scale(60)) / 3,
    height: (width - scale(60)) / 3,
    marginBottom: verticalScale(10),
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },

  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  deletePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: scale(24),
    height: scale(24),
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deletePhotoText: {
    color: '#ffffff',
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    lineHeight: moderateScale(16),
  },

  photoOrder: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: scale(20),
    height: scale(20),
    borderRadius: 10,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoOrderText: {
    color: '#ffffff',
    fontSize: moderateScale(12),
    fontWeight: 'bold',
  },

  // Save Button Styles
  saveButton: {
    backgroundColor: '#000000',
    paddingVertical: verticalScale(16),
    borderRadius: 8,
    alignItems: 'center',
    marginTop: verticalScale(20),
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  disabledButton: {
    backgroundColor: '#cccccc',
    elevation: 0,
    shadowOpacity: 0,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: moderateScale(18),
    fontWeight: '600',
  },

  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalContent: {
    backgroundColor: '#ffffff',
    width: '85%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: scale(20),
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  modalTitle: {
    fontSize: moderateScale(20),
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },

  searchInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    fontSize: moderateScale(16),
    backgroundColor: '#ffffff',
    color: '#000000',
    marginBottom: verticalScale(16),
  },

  optionItem: {
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  optionText: {
    fontSize: moderateScale(16),
    color: '#000000',
  },

  cancelButton: {
    marginTop: verticalScale(16),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },

  cancelButtonText: {
    fontSize: moderateScale(16),
    color: '#000000',
    fontWeight: '500',
  },

  // Loading Styles
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(40),
  },

  loadingText: {
    fontSize: moderateScale(16),
    color: '#666666',
    marginTop: verticalScale(12),
  },

  disabledText: {
    color: '#cccccc',
  },
});

export default AddCarScreen;