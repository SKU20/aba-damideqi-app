// frontend/src/screens/EventDetailsScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Image,
  TextInput,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import eventService from '../services/eventService';

const { width, height } = Dimensions.get('window');

const isSmallDevice = width < 360;
const scale = (size) => (width / 375) * size;
const verticalScale = (size) => (height / 812) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const EventDetailsScreen = ({ 
  goBackToMain, 
  selectedLanguage = 'georgian',
  userId
}) => {
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventImage, setEventImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  const texts = {
    georgian: {
      createEvent: 'ღონისძიების შექმნა',
      eventTitle: 'ღონისძიების სახელი',
      eventDescription: 'აღწერა',
      eventDate: 'თარიღი',
      eventTime: 'დრო',
      eventLocation: 'მდებარეობა',
      eventPoster: 'ღონისძიების აფიშა',
      addPoster: 'აფიშის დამატება',
      changePoster: 'აფიშის შეცვლა',
      removePoster: 'აფიშის წაშლა',
      titlePlaceholder: 'შეიყვანეთ ღონისძიების სახელი',
      descriptionPlaceholder: 'შეიყვანეთ ღონისძიების დეტალური აღწერა...',
      datePlaceholder: 'YYYY-MM-DD',
      timePlaceholder: 'HH:MM',
      locationPlaceholder: 'შეიყვანეთ ადგილმდებარეობა',
      createButton: 'შექმნა',
      cancel: 'გაუქმება',
      back: 'უკან',
      chooseImageSource: 'აირჩიეთ სურათის წყარო',
      camera: 'კამერა',
      gallery: 'გალერეა',
      fillAllFields: 'გთხოვთ შეავსოთ ყველა ველი',
      eventCreated: 'ღონისძიება წარმატებით შეიქმნა!',
      error: 'შეცდომა',
      permissionError: 'კამერის ნებართვა საჭიროა',
      imagePickerError: 'სურათის არჩევისას მოხდა შეცდომა',
      creating: 'იქმნება...',
      networkError: 'ქსელის შეცდომა. გთხოვთ სცადოთ ხელახლა.',
    },
    english: {
      createEvent: 'Create Event',
      eventTitle: 'Event Title',
      eventDescription: 'Description',
      eventDate: 'Date',
      eventTime: 'Time',
      eventLocation: 'Location',
      eventPoster: 'Event Poster',
      addPoster: 'Add Poster',
      changePoster: 'Change Poster',
      removePoster: 'Remove Poster',
      titlePlaceholder: 'Enter event title',
      descriptionPlaceholder: 'Enter detailed event description...',
      datePlaceholder: 'YYYY-MM-DD',
      timePlaceholder: 'HH:MM',
      locationPlaceholder: 'Enter location',
      createButton: 'Create Event',
      cancel: 'Cancel',
      back: 'Back',
      chooseImageSource: 'Choose Image Source',
      camera: 'Camera',
      gallery: 'Gallery',
      fillAllFields: 'Please fill all fields',
      eventCreated: 'Event created successfully!',
      error: 'Error',
      permissionError: 'Camera permission is required',
      imagePickerError: 'Error occurred while picking image',
      creating: 'Creating...',
      networkError: 'Network error. Please try again.',
    }
  };

  const t = texts[selectedLanguage] || texts.english;

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.error, t.permissionError);
      return false;
    }
    return true;
  };

  const pickImageFromGallery = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setEventImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image from gallery:', error);
      Alert.alert(t.error, t.imagePickerError);
    }
    setShowImageModal(false);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.error, t.permissionError);
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setEventImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t.error, t.imagePickerError);
    }
    setShowImageModal(false);
  };

  // Validate date format (YYYY-MM-DD)
  const validateDate = (date) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;
    
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj);
  };

  // Validate time format (HH:MM)
  const validateTime = (time) => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  };

  const handleCreateEvent = async () => {
    // Validate required fields
    if (!eventTitle.trim() || !eventDescription.trim() || !eventDate.trim() || 
        !eventTime.trim() || !eventLocation.trim()) {
      Alert.alert(t.error, t.fillAllFields);
      return;
    }

    // Validate date format
    if (!validateDate(eventDate)) {
      Alert.alert(t.error, 'Please enter date in YYYY-MM-DD format');
      return;
    }

    // Validate time format
    if (!validateTime(eventTime)) {
      Alert.alert(t.error, 'Please enter time in HH:MM format');
      return;
    }

    setIsLoading(true);

    try {
      const eventData = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        eventDate: eventDate.trim(),
        eventTime: eventTime.trim(),
        location: eventLocation.trim(),
        imageUri: eventImage?.uri || null,
        userId: userId
      };

      const response = await eventService.createEvent(eventData);

      Alert.alert(
        t.eventCreated,
        '',
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              goBackToMain && goBackToMain();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error creating event:', error);
      const errorMessage = error.message.includes('Network') ? 
        t.networkError : 
        `${t.error}: ${error.message}`;
      Alert.alert(t.error, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEventTitle('');
    setEventDescription('');
    setEventDate('');
    setEventTime('');
    setEventLocation('');
    setEventImage(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={goBackToMain}
        >
          <Ionicons name="arrow-back" size={moderateScale(24)} color="#000" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>{t.createEvent}</Text>
        
        <TouchableOpacity 
          style={styles.resetButton}
          onPress={resetForm}
        >
          <Ionicons name="refresh-outline" size={moderateScale(22)} color="#666" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20: 0} 
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Event Poster Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.eventPoster}</Text>
            
            {eventImage ? (
              <View style={styles.imageContainer}>
                <Image 
                  source={{ uri: eventImage.uri }} 
                  style={styles.eventImage} 
                  resizeMode="cover"
                />
                <View style={styles.imageActions}>
                  <TouchableOpacity 
                    style={styles.imageActionButton}
                    onPress={() => setShowImageModal(true)}
                  >
                    <Ionicons name="camera" size={moderateScale(18)} color="black" />
                    <Text style={styles.imageActionText}>{t.changePoster}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.imageActionButton, styles.removeButton]}
                    onPress={() => setEventImage(null)}
                  >
                    <Ionicons name="trash" size={moderateScale(18)} color="black" />
                    <Text style={styles.imageActionText}>{t.removePoster}</Text>
                  </TouchableOpacity>
                </View>
              </View>
          ) : (
            <TouchableOpacity 
              style={styles.addImageContainer}
              onPress={() => setShowImageModal(true)}
            >
              <Ionicons name="image-outline" size={moderateScale(48)} color="#ccc" />
              <Text style={styles.addImageText}>{t.addPoster}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Event Details Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.eventTitle}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.titlePlaceholder}
            placeholderTextColor="#999"
            value={eventTitle}
            onChangeText={setEventTitle}
            maxLength={100}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.eventDescription}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t.descriptionPlaceholder}
            placeholderTextColor="#999"
            value={eventDescription}
            onChangeText={setEventDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.characterCount}>
            {eventDescription.length}/1000
          </Text>
        </View>

        {/* Date and Time Row */}
        <View style={styles.rowSection}>
          <View style={[styles.section, styles.halfWidth]}>
            <Text style={styles.sectionTitle}>{t.eventDate}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.datePlaceholder}
              placeholderTextColor="#999"
              value={eventDate}
              onChangeText={setEventDate}
              maxLength={10}
            />
          </View>

          <View style={[styles.section, styles.halfWidth]}>
            <Text style={styles.sectionTitle}>{t.eventTime}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.timePlaceholder}
              placeholderTextColor="#999"
              value={eventTime}
              onChangeText={setEventTime}
              maxLength={5}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.eventLocation}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.locationPlaceholder}
            placeholderTextColor="#999"
            value={eventLocation}
            onChangeText={setEventLocation}
            maxLength={200}
          />
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, isLoading && styles.disabledButton]}
          onPress={handleCreateEvent}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="white" style={{ marginRight: 10 }} />
              <Text style={styles.createButtonText}>{t.creating}</Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>{t.createButton}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </KeyboardAvoidingView>

    {/* Image Source Modal */}
    <Modal
      visible={showImageModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowImageModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t.chooseImageSource}</Text>
          
          <TouchableOpacity style={styles.modalOption} onPress={takePhoto}>
            <Ionicons name="camera" size={moderateScale(24)} color="black" />
            <Text style={styles.modalOptionText}>{t.camera}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.modalOption} onPress={pickImageFromGallery}>
            <Ionicons name="image" size={moderateScale(24)} color="black" />
            <Text style={styles.modalOptionText}>{t.gallery}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.modalCancelButton} 
            onPress={() => setShowImageModal(false)}
          >
            <Text style={styles.modalCancelText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </SafeAreaView>
);
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(20),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(15),
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: moderateScale(8),
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: 'black',
    flex: 1,
    textAlign: 'center',
  },
  resetButton: {
    padding: moderateScale(8),
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginVertical: verticalScale(8),
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(20),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    marginVertical: verticalScale(8),
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(20),
    gap: moderateScale(15),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  halfWidth: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    marginVertical: 0,
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: 'black',
    marginBottom: verticalScale(12),
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: moderateScale(10),
    paddingHorizontal: moderateScale(15),
    paddingVertical: verticalScale(12),
    fontSize: moderateScale(14),
    color: 'black',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: verticalScale(100),
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: moderateScale(12),
    color: '#666',
    textAlign: 'right',
    marginTop: verticalScale(5),
  },
  imageContainer: {
    position: 'relative',
    borderRadius: moderateScale(15),
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: verticalScale(200),
    borderRadius: moderateScale(15),
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: moderateScale(15),
    marginTop: verticalScale(10),
  },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: moderateScale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    gap: moderateScale(5),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  removeButton: {
    backgroundColor: 'white',
    borderColor: '#ff4757',
  },
  imageActionText: {
    color: 'black',
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  addImageContainer: {
    height: verticalScale(200),
    backgroundColor: '#f8f9fa',
    borderRadius: moderateScale(15),
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: moderateScale(14),
    color: '#999',
    marginTop: verticalScale(10),
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: 'black',
    marginHorizontal: moderateScale(20),
    marginVertical: verticalScale(20),
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: 'white',
    fontSize: moderateScale(16),
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomPadding: {
    height: verticalScale(20),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    paddingVertical: verticalScale(30),
    paddingHorizontal: moderateScale(20),
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: verticalScale(25),
    color: 'black',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(15),
    paddingHorizontal: moderateScale(20),
    borderRadius: moderateScale(12),
    backgroundColor: 'white',
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalOptionText: {
    fontSize: moderateScale(16),
    color: 'black',
    marginLeft: moderateScale(15),
    fontWeight: '500',
  },
  modalCancelButton: {
    marginTop: verticalScale(10),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalCancelText: {
    fontSize: moderateScale(16),
    color: '#666',
    fontWeight: '600',
  },
});

export default EventDetailsScreen;