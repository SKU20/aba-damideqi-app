import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Removed react-native-size-matters dependency - using manual scaling
const moderateScale = (size) => size;
import eventService from '../services/eventService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const EventScreen = ({ route, navigation, currentUser, selectedLanguage = 'georgian', goToProfile }) => {
  const { event } = route.params;
  const [hasExpressedInterest, setHasExpressedInterest] = useState(false);
  const [interestedCount, setInterestedCount] = useState(event.interested_people || 0);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(currentUser?.id || null);

  // Translation texts
  const texts = {
    georgian: {
      date: 'თარიღი',
      time: 'დრო',
      location: 'მდებარეობა',
      interested: 'დაინტერესებული',
      people: 'ადამიანები',
      description: 'აღწერა',
      expressInterest: 'მაინტერესებს',
      interestExpressed: 'ინტერესი გამოხატულია',
      ownEvent: 'ეს თქვენი ღონისძიებაა',
      deleteEvent: 'ღონისძიების წაშლა',
      deleteConfirm: 'დარწმუნებული ხართ, რომ გსურთ ღონისძიების წაშლა? ეს მოქმედება შეუქცევადია.',
      cancel: 'გაუქმება',
      delete: 'წაშლა',
      success: 'წარმატება',
      eventDeleted: 'ღონისძიება წარმატებით წაიშალა',
      error: 'შეცდომა',
      deleteFailed: 'ღონისძიების წაშლა ვერ მოხერხდა',
      organizer: 'ორგანიზატორი'
    },
    english: {
      date: 'Date',
      time: 'Time',
      location: 'Location',
      interested: 'Interested',
      people: 'People',
      description: 'Description',
      expressInterest: 'Interested',
      interestExpressed: 'Interest Expressed',
      ownEvent: 'This is your event',
      deleteEvent: 'Delete Event',
      deleteConfirm: 'Are you sure you want to delete this event? This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
      success: 'Success',
      eventDeleted: 'Event deleted successfully',
      error: 'Error',
      deleteFailed: 'Failed to delete event',
      organizer: 'Organizer'
    }
  };
  

  const t = texts[selectedLanguage] || texts.georgian;

  const handleDeleteEvent = () => {
    Alert.alert(
      t.deleteEvent,
      t.deleteConfirm,
      [
        {
          text: t.cancel,
          style: 'cancel',
        },
        {
          text: t.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await eventService.deleteEvent(event.id);
              Alert.alert(
                t.success,
                t.eventDeleted,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert(t.error, t.deleteFailed);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!currentUser) {
      getCurrentUser();
    } else {
      setCurrentUserId(currentUser.id);
    }
    // First try server status (user-specific), fallback to local if server not reachable
    fetchInterestStatus();
  }, [currentUser]);

  const getCurrentUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        setCurrentUserId(user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const fetchInterestStatus = async () => {
    try {
      const resp = await eventService.getInterestStatus(event.id);
      if (resp?.success) {
        if (typeof resp.interested === 'boolean') setHasExpressedInterest(resp.interested);
        if (typeof resp.interestedCount === 'number') setInterestedCount(resp.interestedCount);
        return;
      }
      // Fallback to local cache only if server didn't return success
      const interestedEvents = await AsyncStorage.getItem('interestedEvents');
      if (interestedEvents) {
        const events = JSON.parse(interestedEvents);
        setHasExpressedInterest(events.includes(event.id.toString()));
      }
    } catch (error) {
      // Network fail fallback to local cache
      try {
        const interestedEvents = await AsyncStorage.getItem('interestedEvents');
        if (interestedEvents) {
          const events = JSON.parse(interestedEvents);
          setHasExpressedInterest(events.includes(event.id.toString()));
        }
      } catch (_) {}
    }
  };

  const formatEventDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const locale = selectedLanguage === 'english' ? 'en-US' : 'ka-GE';
      return date.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  const formatEventTime = (timeString) => {
    try {
      const time = timeString.includes('T') ? new Date(timeString) : new Date(`2000-01-01T${timeString}`);
      return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return timeString;
    }
  };

  const handleInterestClick = async () => {
    if (!currentUserId) {
      Alert.alert('შეცდომა', 'გთხოვთ შეხვიდეთ სისტემაში');
      return;
    }

    if (currentUserId === event.user_id) {
      Alert.alert('შეცდომა', 'თქვენ ვერ გამოხატავთ ინტერესს საკუთარი ღონისძიების მიმართ');
      return;
    }

    if (hasExpressedInterest) {
      Alert.alert('ინფორმაცია', 'თქვენ უკვე გამოხატეთ ინტერესი ამ ღონისძიების მიმართ');
      return;
    }

    setLoading(true);
    try {
      const response = await eventService.addEventInterest(event.id);
      
      if (response.success) {
        // Trust server response
        if (typeof response.interestedCount === 'number') setInterestedCount(response.interestedCount);
        if (typeof response.interested === 'boolean') setHasExpressedInterest(response.interested);
        else setHasExpressedInterest(true);
        // Refresh from server for consistency
        fetchInterestStatus();
      } else {
        Alert.alert('შეცდომა', 'ინტერესის გამოხატვა ვერ მოხერხდა');
      }
    } catch (error) {
      console.error('Error adding interest:', error);
      Alert.alert('შეცდომა', 'ინტერესის გამოხატვა ვერ მოხერხდა');
    } finally {
      setLoading(false);
    }
  };

  const getEventImage = (event) => {
    if (event.image_url) {
      return { uri: event.image_url };
    }
    return null;
  };

  const imageSource = getEventImage(event);
  const creatorUsername = event.user_profiles?.username || 'user';
  const creatorUserId = event.user_id || event.user_profiles?.id;
  const isOwnEvent = currentUserId === event.user_id;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Image - Clean without text overlay */}
        <View style={styles.imageContainer}>
          {imageSource ? (
            <Image source={imageSource} style={styles.eventImage} resizeMode="cover" />
          ) : (
            <View style={[styles.eventImage, styles.placeholderImage]}>
              <Ionicons name="calendar-outline" size={moderateScale(60)} color="rgba(255,255,255,0.7)" />
            </View>
          )}
          
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              const returnTab = route?.params?.returnTab;
              if (returnTab && navigation?.navigate) {
                navigation.navigate('MainScreen', { initialTab: returnTab });
              } else {
                navigation.goBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={moderateScale(24)} color="white" />
          </TouchableOpacity>
        </View>

        {/* Event Details */}
        <View style={styles.detailsContainer}>
          {/* Event Title */}
          <View style={styles.titleContainer}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventCreator}>
              {t.organizer}: 
              <Text
                style={{ textDecorationLine: 'underline' }}
                onPress={() => {
                  if (goToProfile && creatorUserId) {
                    goToProfile({ userId: creatorUserId, username: creatorUsername });
                  }
                }}
              >
                @{creatorUsername}
              </Text>
            </Text>
          </View>

          {/* Date and Time */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar" size={moderateScale(24)} color="#000" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t.date}</Text>
              <Text style={styles.detailValue}>{formatEventDate(event.event_date)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="time" size={moderateScale(24)} color="#000" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t.time}</Text>
              <Text style={styles.detailValue}>{formatEventTime(event.event_time)}</Text>
            </View>
          </View>

          {/* Location */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="location" size={moderateScale(24)} color="#000" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t.location}</Text>
              <Text style={styles.detailValue}>{event.location}</Text>
            </View>
          </View>

          {/* Interested Count */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="people" size={moderateScale(24)} color="#000" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t.interested}</Text>
              <Text style={styles.detailValue}>{interestedCount} {t.people}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionTitle}>{t.description}</Text>
            <Text style={styles.descriptionText}>{event.description}</Text>
          </View>

          {/* Interest Button */}
          {!isOwnEvent && (
            <TouchableOpacity
              style={[styles.interestButton, hasExpressedInterest && styles.disabledButton]}
              onPress={handleInterestClick}
              disabled={loading || hasExpressedInterest}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons 
                    name={hasExpressedInterest ? "checkmark-circle" : "heart-outline"} 
                    size={moderateScale(20)} 
                    color="white" 
                  />
                  <Text style={styles.interestButtonText}>
                    {hasExpressedInterest ? t.interestExpressed : t.expressInterest}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isOwnEvent && (
            <View>
              <View style={styles.ownEventNotice}>
                <Ionicons name="information-circle" size={moderateScale(20)} color="#000" />
                <Text style={styles.ownEventText}>{t.ownEvent}</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={handleDeleteEvent}
              >
                <Ionicons name="trash" size={moderateScale(20)} color="white" />
                <Text style={styles.deleteButtonText}>{t.deleteEvent}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
    height: height * 0.3,
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: moderateScale(40),
    left: moderateScale(20),
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  detailsContainer: {
    padding: moderateScale(20),
  },
  titleContainer: {
    marginBottom: moderateScale(25),
    paddingBottom: moderateScale(20),
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
  },
  eventTitle: {
    fontSize: moderateScale(26),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: moderateScale(8),
  },
  eventCreator: {
    fontSize: moderateScale(16),
    color: '#000',
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: moderateScale(20),
    paddingBottom: moderateScale(15),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(15),
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: moderateScale(14),
    color: '#000',
    marginBottom: moderateScale(4),
    fontWeight: '500',
  },
  detailValue: {
    fontSize: moderateScale(16),
    color: '#000',
    fontWeight: '600',
  },
  descriptionContainer: {
    marginTop: moderateScale(10),
    marginBottom: moderateScale(30),
  },
  descriptionTitle: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: moderateScale(15),
  },
  descriptionText: {
    fontSize: moderateScale(16),
    color: '#000',
    lineHeight: moderateScale(24),
  },
  interestButton: {
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(15),
    paddingHorizontal: moderateScale(30),
    borderRadius: moderateScale(25),
    marginBottom: moderateScale(20),
  },
  disabledButton: {
    backgroundColor: '#000',
    opacity: 0.5,
  },
  interestButtonText: {
    color: 'white',
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    marginLeft: moderateScale(8),
  },
  ownEventNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(15),
    paddingHorizontal: moderateScale(20),
    backgroundColor: '#f8f9fa',
    borderRadius: moderateScale(10),
    marginBottom: moderateScale(20),
  },
  ownEventText: {
    color: '#000',
    fontSize: moderateScale(14),
    marginLeft: moderateScale(8),
    fontStyle: 'italic',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(12),
    paddingHorizontal: moderateScale(20),
    borderRadius: moderateScale(8),
    marginTop: moderateScale(15),
  },
  deleteButtonText: {
    color: 'white',
    fontSize: moderateScale(16),
    fontWeight: '600',
    marginLeft: moderateScale(8),
  },
});

export default EventScreen;