import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Dimensions,
  FlatList,
  Alert,
  Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const isSmallDevice = width < 360;
const scale = (size) => (width / 375) * size;
const verticalScale = (size) => (height / 812) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const CarProfileScreen = ({ 
  goBackToMain, 
  selectedLanguage, 
  carData, 
  userId, 
  user, 
  isOwner = false,
  onDelete, 
  goToProfile,
  openChatWithUser,
}) => {

  // Calculate ownership locally as well for double-checking
  const isActualOwner = isOwner || (carData?.user_id === userId) || (String(carData?.user_id) === String(userId));

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photoFlatListRef = useRef(null);

  const texts = {
    georgian: {
      backToMain: 'უკან',
      carDetails: 'მანქანის დეტალები',
      specifications: 'სპეციფიკაციები',
      year: 'წელი',
      brand: 'მარკა',
      model: 'მოდელი',
      vehicleType: 'ტრანსპორტის ტიპი',
      engineCapacity: 'ძრავის მოცულობა',
      horsepower: 'ცხენის ძალა',
      status: 'სტატუსი',
      stock: 'სტოკი',
      nonStock: 'ნონ-სტოკი',
      modifications: 'მოდიფიკაციები',
      noModifications: 'მოდიფიკაციები არ არის',
      car: 'მანქანა',
      motorcycle: 'მოტოციკლეტი',
      liter: 'ლ',
      hp: 'ც.ძ',
      photos: 'ფოტოები',
      noPhotos: 'ფოტოები არ არის',
      edit: 'რედაქტირება',
      delete: 'წაშლა',
      share: 'გაზიარება',
      deleteConfirm: 'დარწმუნებული ხართ, რომ გსურთ ამ მანქანის წაშლა?',
      cancel: 'გაუქმება',
      deleteButton: 'წაშლა',
      shareText: 'ნახეთ ჩემი მანქანა:',
      of: '-დან',
      owner: 'მფლობელი',
      you: 'თქვენ'
    },
    english: {
      backToMain: 'Back',
      carDetails: 'Car Details',
      specifications: 'Specifications',
      year: 'Year',
      brand: 'Brand',
      model: 'Model',
      vehicleType: 'Vehicle Type',
      engineCapacity: 'Engine Capacity',
      horsepower: 'Horsepower',
      status: 'Status',
      stock: 'Stock',
      nonStock: 'Non-Stock',
      modifications: 'Modifications',
      noModifications: 'No modifications',
      car: 'Car',
      motorcycle: 'Motorcycle',
      liter: 'L',
      hp: 'HP',
      photos: 'Photos',
      noPhotos: 'No photos available',
      edit: 'Edit',
      delete: 'Delete',
      share: 'Share',
      deleteConfirm: 'Are you sure you want to delete this car?',
      cancel: 'Cancel',
      deleteButton: 'Delete',
      shareText: 'Check out my car:',
      of: 'of',
      owner: 'Owner',
      you: 'You'
    }
  };
  
  const t = texts[selectedLanguage] || texts.english;

  // Helper functions to extract data from car object
  const getDisplayName = () => {
    const brandName = carData.car_brands?.name || carData.moto_brands?.name || carData.custom_brand || 'Unknown Brand';
    const modelName = carData.car_models?.name || carData.moto_models?.name || carData.custom_model || 'Unknown Model';
    return `${carData.year} ${brandName} ${modelName}`;
  };

  const getVehicleTypeDisplay = () => {
    if (carData.vehicle_type === 'car') return t.car;
    if (carData.vehicle_type === 'motorcycle') return t.motorcycle;
    return carData.custom_vehicle_type || carData.vehicle_type;
  };

  const getBrandName = () => {
    return carData.car_brands?.name || carData.moto_brands?.name || carData.custom_brand || 'N/A';
  };

  const getModelName = () => {
    return carData.car_models?.name || carData.moto_models?.name || carData.custom_model || 'N/A';
  };

  const getModificationsText = () => {
    if (!carData.is_stock && carData.modifications_comment) {
      return carData.modifications_comment;
    }
    return t.noModifications;
  };

  const getPhotos = () => {
    return carData.car_photos || [];
  };

  const getOwnerId = () => {
    return (
      carData?.user_id ||
      carData?.owner_id ||
      carData?.owner?.id ||
      carData?.users?.id ||
      carData?.user?.id ||
      null
    );
  };

  const getOwnerUsername = () => {
    try {
      if (carData?.user_profiles) {
        const p = Array.isArray(carData.user_profiles) ? carData.user_profiles[0] : carData.user_profiles;
        if (p?.username) return p.username;
      }
      return carData?.username || carData?.owner?.username || carData?.users?.username || '';
    } catch {
      return '';
    }
  };

 const getOwnerDisplayName = () => {
    
    if (isActualOwner) {
      return t.you;
    }

    // Check if owner data is embedded directly in carData from API JOIN
    if (carData.username) {
      return carData.username;
    }
    
    if (carData.first_name || carData.last_name) {
      const fullName = `${carData.first_name || ''} ${carData.last_name || ''}`.trim();
      if (fullName) return fullName;
    }

    // Check nested user_profiles object (Supabase style)
    if (carData.user_profiles) {
      const profile = carData.user_profiles;
      return profile.username || 
             `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 
             'Unknown User';
    }

    // If owner info was passed down from parent
    if (user && carData?.user_id === user?.id) {
      return user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';
    }

    // Try to get owner info from nested objects
    const owner = carData.owner || carData.users || carData.user;
    if (owner) {
      return (
        owner.username ||
        `${owner.first_name || ''} ${owner.last_name || ''}`.trim() ||
        `User ${owner.id}` ||
        'Unknown User'
      );
    }

    // Fallback - show partial user ID for debugging
    if (carData.user_id) {
      return `User ${carData.user_id.toString().slice(0, 8)}...`;
    }

    return 'Unknown User';
  };
  // Handle photo scroll
  const onPhotoScroll = (event) => {
    const contentOffset = event.nativeEvent.contentOffset;
    const viewSize = event.nativeEvent.layoutMeasurement;
    const pageNum = Math.floor(contentOffset.x / viewSize.width);
    setCurrentPhotoIndex(pageNum);
  };

  // Handle photo thumbnail press
  const onThumbnailPress = (index) => {
    setCurrentPhotoIndex(index);
    photoFlatListRef.current?.scrollToIndex({ index, animated: true });
  };

  // Handle share
  const handleShare = async () => {
    try {
      const message = `${t.shareText} ${getDisplayName()}`;
      await Share.share({
        message: message,
        title: getDisplayName()
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Handle delete
  const handleDelete = () => {
    Alert.alert(
      t.delete,
      t.deleteConfirm,
      [
        {
          text: t.cancel,
          style: 'cancel',
        },
        {
          text: t.deleteButton,
          style: 'destructive',
          onPress: () => {
            if (onDelete) {
              onDelete(carData.id);
            }
          },
        },
      ]
    );
  };

  // Render photo item for main gallery
  const renderPhotoItem = ({ item, index }) => (
    <View style={styles.photoContainer}>
      <Image
        source={{ uri: item.photo_url }}
        style={styles.photo}
        resizeMode="contain"
        onError={(error) => {
          console.error('Image loading error:', error.nativeEvent.error);
        }}
      />
    </View>
  );

  // Render thumbnail
  const renderThumbnail = ({ item, index }) => (
    <TouchableOpacity
      style={[
        styles.thumbnail,
        currentPhotoIndex === index && styles.activeThumbnail
      ]}
      onPress={() => onThumbnailPress(index)}
    >
      <Image
        source={{ uri: item.photo_url }}
        style={styles.thumbnailImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  const photos = getPhotos();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackToMain} style={styles.backButton}>
          <Ionicons name="chevron-back" size={moderateScale(24)} color="#333" />
          <Text style={styles.backButtonText}>{t.backToMain}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
            <Ionicons name="share-outline" size={moderateScale(22)} color="#333" />
          </TouchableOpacity>
          {isActualOwner && (
            <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
              <Ionicons name="trash-outline" size={moderateScale(22)} color="#ff4757" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photos Section */}
        <View style={styles.photosSection}>
          {photos.length > 0 ? (
            <>
              <View style={styles.mainPhotoContainer}>
                <FlatList
                  ref={photoFlatListRef}
                  data={photos}
                  renderItem={renderPhotoItem}
                  keyExtractor={(item, index) => `photo-${item.id || index}`}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onPhotoScroll}
                  scrollEventThrottle={16}
                  getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                />
                {photos.length > 1 && (
                  <View style={styles.photoCounter}>
                    <Text style={styles.photoCounterText}>{currentPhotoIndex + 1} {t.of} {photos.length}</Text>
                  </View>
                )}
              </View>
              {photos.length > 1 && (
                <View style={styles.thumbnailsContainer}>
                  <FlatList
                    data={photos}
                    renderItem={renderThumbnail}
                    keyExtractor={(item, index) => `thumb-${item.id || index}`}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbnailsContent}
                  />
                </View>
              )}
            </>
          ) : (
            <View style={styles.noPhotosContainer}>
              <Ionicons name="image-outline" size={moderateScale(48)} color="#ccc" />
            </View>
          )}
        </View>

        {/* Car Information */}
        <View style={styles.infoSection}>
          <View style={styles.titleSection}>
            <Text style={styles.carTitle} numberOfLines={1}>{getDisplayName()}</Text>
            {!isActualOwner && (
              <TouchableOpacity
                style={[styles.raceButton, { alignSelf: 'flex-start', marginTop: moderateScale(6) }]}
                onPress={() => {
                  const oid = getOwnerId();
                  console.log('[CarProfileScreen] Race button pressed. ownerId=', oid, 'has openChatWithUser=', typeof openChatWithUser === 'function');
                  if (oid && typeof openChatWithUser === 'function') {
                    const title = getDisplayName();
                    const greeting = selectedLanguage === 'georgian' ? 'აბა დამიდექი!' : "Let's Race!";
                    const details = title; // could extend with engine/hp if needed
                    const msg = `${greeting}\n${details}`;
                    openChatWithUser({ userId: oid, initialMessage: msg })
                      .then(() => {
                        console.log('[CarProfileScreen] openChatWithUser resolved.');
                      })
                      .catch((e) => {
                        console.warn('[CarProfileScreen] openChatWithUser error:', e?.message || e);
                        try { Alert.alert('Chat', 'Could not open chat.'); } catch (_) {}
                      });
                  }
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={moderateScale(14)} color="#fff" />
                <Text style={styles.raceButtonText}>{selectedLanguage === 'georgian' ? 'აბა დამიდექი!' : "Let's Race!"}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.vehicleType}>{getVehicleTypeDisplay()}</Text>
            <View style={styles.ownerSection}>
              <View style={styles.ownerInfo}>
                <Ionicons name="person-outline" size={moderateScale(16)} color="#666" style={styles.ownerIcon} />
                <Text style={styles.ownerLabel}>{t.owner}: </Text>
                <TouchableOpacity
                  onPress={() => {
                    const oid = getOwnerId();
                    const uname = getOwnerUsername();
                    if (goToProfile && oid) {
                      goToProfile({ userId: oid, username: uname });
                    }
                  }}
                  disabled={!getOwnerId()}
                >
                  <Text style={[styles.ownerName, isActualOwner && styles.ownerNameHighlight, { textDecorationLine: getOwnerId() ? 'underline' : 'none' }]}>
                    {getOwnerDisplayName()}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Specifications */}
          <View style={styles.specificationsSection}>
            <Text style={styles.sectionTitle}>{t.specifications}</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>{t.year}</Text>
                <Text style={styles.specValue}>{carData.year}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>{t.brand}</Text>
                <Text style={styles.specValue}>{getBrandName()}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>{t.model}</Text>
                <Text style={styles.specValue}>{getModelName()}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>{t.vehicleType}</Text>
                <Text style={styles.specValue}>{getVehicleTypeDisplay()}</Text>
              </View>
              {carData.engine_capacity && (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>{t.engineCapacity}</Text>
                  <Text style={styles.specValue}>{carData.engine_capacity}{t.liter}</Text>
                </View>
              )}
              {carData.horsepower && (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>{t.horsepower}</Text>
                  <Text style={styles.specValue}>{carData.horsepower} {t.hp}</Text>
                </View>
              )}
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>{t.status}</Text>
                <Text style={[styles.specValue, carData.is_stock ? styles.stockText : styles.nonStockText]}>
                  {carData.is_stock ? t.stock : t.nonStock}
                </Text>
              </View>
            </View>
          </View>

          {/* Modifications Section */}
          {!carData.is_stock && (
            <View style={styles.modificationsSection}>
              <Text style={styles.sectionTitle}>{t.modifications}</Text>
              <View style={styles.modificationsContainer}>
                <Text style={styles.modificationsText}>{getModificationsText()}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  // Container & Base Layout
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  content: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(16),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: moderateScale(8),
    paddingRight: moderateScale(12),
  },

  backButtonText: {
    fontSize: moderateScale(17),
    fontWeight: '600',
    color: '#333',
    marginLeft: moderateScale(6),
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionButton: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: moderateScale(10),
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  // Photos Section
  photosSection: {
    backgroundColor: '#ffffff',
    marginBottom: moderateScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  mainPhotoContainer: {
    position: 'relative',
    height: verticalScale(280),
    backgroundColor: '#f8f9fa',
  },

  photoContainer: {
    width: width,
    height: verticalScale(280),
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },

  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },

  photoCounter: {
    position: 'absolute',
    top: moderateScale(16),
    right: moderateScale(16),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(16),
  },

  photoCounterText: {
    color: '#ffffff',
    fontSize: moderateScale(12),
    fontWeight: '600',
  },

  thumbnailsContainer: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(16),
    backgroundColor: '#ffffff',
  },

  thumbnailsContent: {
    paddingHorizontal: moderateScale(4),
  },

  thumbnail: {
    width: moderateScale(64),
    height: moderateScale(64),
    borderRadius: moderateScale(10),
    marginHorizontal: moderateScale(4),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },

  activeThumbnail: {
    borderColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  thumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },

  noPhotosContainer: {
    height: verticalScale(280),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },

  // Information Section
  infoSection: {
    backgroundColor: '#ffffff',
    borderRadius: moderateScale(16),
    marginHorizontal: moderateScale(16),
    marginBottom: moderateScale(20),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },

  titleSection: {
    padding: moderateScale(20),
    borderBottomWidth: 1,
    borderBottomColor: '#f5f6f7',
  },

  carTitle: {
    fontSize: moderateScale(26),
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: moderateScale(32),
    marginBottom: moderateScale(8),
  },

  vehicleType: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: moderateScale(16),
  },

  raceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6c757d',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(20),
    shadowColor: '#6c757d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: moderateScale(10),
  },

  raceButtonText: {
    color: '#ffffff',
    fontSize: moderateScale(13),
    fontWeight: '700',
    marginLeft: moderateScale(6),
  },

  ownerSection: {
    marginTop: moderateScale(16),
  },

  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  ownerIcon: {
    marginRight: moderateScale(8),
  },

  ownerLabel: {
    fontSize: moderateScale(14),
    color: '#6c757d',
    fontWeight: '500',
  },

  ownerName: {
    fontSize: moderateScale(14),
    color: '#007AFF',
    fontWeight: '600',
  },

  ownerNameHighlight: {
    color: '#28a745',
    fontWeight: '700',
  },

  // Specifications Section
  specificationsSection: {
    padding: moderateScale(20),
    borderBottomWidth: 1,
    borderBottomColor: '#f5f6f7',
  },

  sectionTitle: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: moderateScale(16),
  },

  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -moderateScale(6),
  },

  specItem: {
    width: '50%',
    paddingHorizontal: moderateScale(6),
    marginBottom: moderateScale(16),
  },

  specLabel: {
    fontSize: moderateScale(12),
    color: '#6c757d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: moderateScale(4),
  },

  specValue: {
    fontSize: moderateScale(16),
    color: '#1a1a1a',
    fontWeight: '600',
  },

  stockText: {
    color: '#28a745',
  },

  nonStockText: {
    color: '#fd7e14',
  },

  // Modifications Section
  modificationsSection: {
    padding: moderateScale(20),
  },

  modificationsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: moderateScale(12),
    padding: moderateScale(16),
    borderLeftWidth: 4,
    borderLeftColor: '#fd7e14',
  },

  modificationsText: {
    fontSize: moderateScale(15),
    color: '#495057',
    lineHeight: moderateScale(22),
    fontStyle: 'italic',
  },
});

export default CarProfileScreen;