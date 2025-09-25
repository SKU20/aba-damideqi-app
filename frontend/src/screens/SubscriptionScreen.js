import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert, Dimensions, ScrollView } from 'react-native';
import SubscriptionService from '../services/subscriptionService';

const { width, height } = Dimensions.get('window');

// Responsive helpers
const isSmallDevice = width < 360;
const isMediumDevice = width < 400;
const scale = (size) => (width / 375) * size; // Base on iPhone X width
const verticalScale = (size) => (height / 812) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const SubscriptionScreen = ({ goToHome, goToMain, selectedLanguage, userId }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const result = await SubscriptionService.fetchPlans();
        
        if (result.success) {
          setPlans(result.plans);
        } else {
          console.error('Failed to fetch plans:', result.error);
          Alert.alert(
            selectedLanguage === 'georgian' ? 'შეცდომა' : 'Error',
            selectedLanguage === 'georgian' 
              ? 'გეგმების ჩატვირთვა ვერ მოხერხდა' 
              : 'Failed to load plans'
          );
        }
      } catch (error) {
        console.error('Error in fetchPlans:', error);
        Alert.alert(
          selectedLanguage === 'georgian' ? 'შეცდომა' : 'Error',
          selectedLanguage === 'georgian' 
            ? 'ქსელის შეცდომა' 
            : 'Network error'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [selectedLanguage]);

  const handleSelectPlan = (planId) => {
    setSelectedPlan(planId);
  };

  const handleConfirm = async () => {
    if (!selectedPlan) {
      Alert.alert(
        'Error',
        selectedLanguage === 'georgian' ? 'გთხოვთ აირჩიოთ გეგმა' : 'Please select a plan'
      );
      return;
    }

    if (!userId) {
      Alert.alert(
        'Error',
        selectedLanguage === 'georgian' 
          ? 'მომხმარებლის ID არ არის მითითებული' 
          : 'User ID is missing. Please log in again.'
      );
      return;
    }

    setCreating(true);
    
    try {
      const result = await SubscriptionService.createSubscription(userId, selectedPlan);

      if (result.success) {
        Alert.alert(
          selectedLanguage === 'georgian' ? 'წარმატება!' : 'Success!',
          selectedLanguage === 'georgian' 
            ? 'თქვენი გამოწერა წარმატებით შეიქმნა! 7-დღიანი უფასო საცდელი პერიოდი დაიწყო.'
            : 'Your subscription has been created successfully! Your 7-day free trial has started.',
          [
            {
              text: selectedLanguage === 'georgian' ? 'კარგი' : 'OK',
              onPress: () => goToMain()
            }
          ]
        );
      } else {
        // Handle specific error messages
        let errorMessage = result.error || 'Unknown error occurred';
        
        if (result.error === 'User already has an active subscription') {
          errorMessage = selectedLanguage === 'georgian' 
            ? 'უკვე გაქვთ აქტიური გამოწერა'
            : 'You already have an active subscription';
        } else if (result.error === 'user_id and plan_id are required') {
          errorMessage = selectedLanguage === 'georgian'
            ? 'გთხოვთ აირჩიოთ გეგმა'
            : 'Please select a plan';
        } else if (result.error === 'Plan not found') {
          errorMessage = selectedLanguage === 'georgian'
            ? 'არჩეული გეგმა ვერ მოიძებნა'
            : 'Selected plan not found';
        }

        Alert.alert(
          selectedLanguage === 'georgian' ? 'შეცდომა' : 'Error',
          errorMessage
        );
      }
    } catch (error) {
      console.error('Unexpected error in handleConfirm:', error);
      Alert.alert(
        selectedLanguage === 'georgian' ? 'შეცდომა' : 'Error',
        selectedLanguage === 'georgian'
          ? 'მოულოდნელი შეცდომა. გთხოვთ სცადოთ მოგვიანებით.'
          : 'Unexpected error occurred. Please try again later.'
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#FFD700" size="large" />
          <Text style={styles.loadingText}>
            {selectedLanguage === 'georgian' ? 'იტვირთება...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <Text 
          style={styles.title}
          adjustsFontSizeToFit
          numberOfLines={2}
          minimumFontScale={0.8}
        >
          {selectedLanguage === 'georgian' ? 'აირჩიე გეგმა' : 'Choose Your Plan'}
        </Text>
        <Text 
          style={styles.subtitle}
          adjustsFontSizeToFit
          numberOfLines={2}
          minimumFontScale={0.8}
        >
          {selectedLanguage === 'georgian'
            ? 'პირველი კვირა უფასოა ყველა გეგმისთვის!'
            : 'First week is free for all plans!'}
        </Text>

        <View style={styles.plansContainer}>
          {plans.length === 0 ? (
            <View style={styles.noPlansContainer}>
              <Text style={styles.noPlansText}>
                {selectedLanguage === 'georgian' 
                  ? 'გეგმები ვერ მოიძებნა' 
                  : 'No plans available'}
              </Text>
            </View>
          ) : (
            plans.map(plan => {
              const planTitle = selectedLanguage === 'georgian' ? plan.name_ka : plan.name_en;
              const planDescription = selectedLanguage === 'georgian' ? plan.description_ka : plan.description_en;
              const isSelected = selectedPlan === plan.id;
              
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    isSelected && styles.selectedPlanCard
                  ]}
                  onPress={() => handleSelectPlan(plan.id)}
                  activeOpacity={0.8}
                  disabled={creating}
                >
                  <Text 
                    style={styles.planTitle}
                    adjustsFontSizeToFit
                    numberOfLines={2}
                    minimumFontScale={0.8}
                  >
                    {planTitle}
                  </Text>
                  <Text 
                    style={styles.planPrice}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.8}
                  >
                    {plan.price_gel} GEL / {
                      plan.duration_months === 1 
                        ? (selectedLanguage === 'georgian' ? 'თვე' : 'month')
                        : plan.duration_months === 6 
                        ? (selectedLanguage === 'georgian' ? '6 თვე' : '6 months')
                        : (selectedLanguage === 'georgian' ? 'წელი' : 'year')
                    }
                  </Text>
                  <Text 
                    style={styles.planDescription}
                    adjustsFontSizeToFit
                    numberOfLines={3}
                    minimumFontScale={0.8}
                  >
                    {planDescription}
                  </Text>
                  <Text 
                    style={styles.planHighlight}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.8}
                  >
                    {selectedLanguage === 'georgian' ? 'პირველი კვირა უფასოა!' : 'First week free!'}
                  </Text>
                  {isSelected && (
                    <View style={styles.selectedIndicator}>
                      <Text style={styles.selectedText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
        
        {selectedPlan && (
          <View style={styles.paymentComingSoon}>
            <Text 
              style={styles.comingSoonText}
              adjustsFontSizeToFit
              numberOfLines={3}
              minimumFontScale={0.8}
            >
              {selectedLanguage === 'georgian'
                ? '7-დღიანი უფასო საცდელი პერიოდი დაიწყება დაუყოვნებლივ!'
                : '7-day free trial will start immediately!'}
            </Text>
            <TouchableOpacity 
              style={[styles.confirmButton, creating && styles.disabledButton]} 
              onPress={handleConfirm}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="black" size="small" />
              ) : (
                <Text 
                  style={styles.confirmButtonText}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.8}
                >
                  {selectedLanguage === 'georgian' ? 'დადასტურება' : 'Start Free Trial'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity onPress={goToHome} disabled={creating} style={styles.backLinkContainer}>
          <Text 
            style={[styles.backLink, creating && styles.disabledText]}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.8}
          >
            {selectedLanguage === 'georgian' ? '← მთავარი გვერდი' : '← Back to Home'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: verticalScale(25),
    paddingHorizontal: moderateScale(16),
    paddingBottom: verticalScale(30),
  },
  title: {
    fontSize: moderateScale(24),
    fontWeight: 'bold',
    color: 'white',
    marginBottom: verticalScale(8),
    textAlign: 'center',
    paddingHorizontal: moderateScale(10),
  },
  subtitle: {
    fontSize: moderateScale(14),
    color: '#aaa',
    marginBottom: verticalScale(20),
    textAlign: 'center',
    paddingHorizontal: moderateScale(20),
  },
  loadingText: {
    color: 'white',
    marginTop: verticalScale(12),
    fontSize: moderateScale(14),
  },
  plansContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: verticalScale(25),
  },
  noPlansContainer: {
    padding: moderateScale(20),
    alignItems: 'center',
  },
  noPlansText: {
    color: '#ccc',
    fontSize: moderateScale(16),
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: '#222',
    borderRadius: moderateScale(12),
    padding: moderateScale(20),
    marginBottom: verticalScale(12),
    width: '100%',
    maxWidth: moderateScale(340),
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#444',
    position: 'relative',
    minHeight: verticalScale(160),
  },
  selectedPlanCard: {
    borderColor: '#FFD700',
    backgroundColor: '#333',
  },
  selectedIndicator: {
    position: 'absolute',
    top: moderateScale(10),
    right: moderateScale(10),
    backgroundColor: '#FFD700',
    borderRadius: moderateScale(12),
    width: moderateScale(24),
    height: moderateScale(24),
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: moderateScale(12),
  },
  planTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: 'white',
    marginBottom: verticalScale(6),
    textAlign: 'center',
  },
  planPrice: {
    fontSize: moderateScale(16),
    color: '#FFD700',
    marginBottom: verticalScale(4),
    textAlign: 'center',
  },
  planDescription: {
    fontSize: moderateScale(13),
    color: '#ccc',
    marginBottom: verticalScale(4),
    textAlign: 'center',
    lineHeight: moderateScale(18),
  },
  planHighlight: {
    fontSize: moderateScale(12),
    color: '#00FF99',
    marginTop: verticalScale(6),
    fontWeight: 'bold',
    textAlign: 'center',
  },
  paymentComingSoon: {
    alignItems: 'center',
    marginBottom: verticalScale(16),
    paddingHorizontal: moderateScale(10),
  },
  comingSoonText: {
    color: '#fff',
    fontSize: moderateScale(13),
    marginBottom: verticalScale(12),
    textAlign: 'center',
    paddingHorizontal: moderateScale(10),
    lineHeight: moderateScale(18),
  },
  confirmButton: {
    backgroundColor: '#FFD700',
    paddingVertical: verticalScale(12),
    paddingHorizontal: moderateScale(25),
    borderRadius: moderateScale(8),
    minHeight: verticalScale(44),
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: moderateScale(250),
  },
  disabledButton: {
    backgroundColor: '#999',
  },
  confirmButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: moderateScale(14),
    textAlign: 'center',
  },
  backLinkContainer: {
    marginTop: verticalScale(20),
    paddingHorizontal: moderateScale(10),
  },
  backLink: {
    fontSize: moderateScale(14),
    color: 'white',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  disabledText: {
    color: '#666',
  },
});

export default SubscriptionScreen;