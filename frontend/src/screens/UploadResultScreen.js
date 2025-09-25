import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabaseClient';
import carService from '../services/carService';
import processorService from '../services/processorService';

const UploadResultScreen = ({ route, navigation, selectedLanguage: propLang }) => {
  // Props via navigation
  const { vehicleType = 'car', range = '0-100' } = route?.params || {};

  // Local lang fallback if not provided via props
  const [selectedLanguage, setSelectedLanguage] = useState(propLang || 'georgian');

  const texts = useMemo(() => ({
    georgian: {
      title: 'შედეგის ატვირთვა',
      selectCarTitle: 'აირჩიე შენი მანქანა/მოტო',
      carTab: 'მანქანები',
      motoTab: 'მოტო',
      chooseVideo: 'ვიდეოს დამატება',
      changeVideo: 'ვიდეოს შეცვლა',
      removeVideo: 'ვიდეოს წაშლა',
      videoNoteTitle: 'გაფრთხილება',
      videoNote: 'ტესტის ვიდეო უნდა იყოს ჩაწერილი Dragy მოწყობილობით.',
      back: 'უკან',
      noCars: 'თქვენ ჯერ არ გაქვთ დამატებული მანქანა/მოტო',
      rangeLabel: range === '100-200' ? '100–200 კმ/სთ' : '0–100 კმ/სთ',
      process: 'დამუშავება',
    },
    english: {
      title: 'Upload Result',
      selectCarTitle: 'Select your car/moto',
      carTab: 'Cars',
      motoTab: 'Moto',
      chooseVideo: 'Add Video',
      changeVideo: 'Change Video',
      removeVideo: 'Remove Video',
      videoNoteTitle: 'Notice',
      videoNote: 'Test video must be recorded with a Dragy device.',
      back: 'Back',
      noCars: "You haven't added a car/moto yet",
      rangeLabel: range === '100-200' ? '100–200 km/h' : '0–100 km/h',
      process: 'Process',
    },
  }), [range]);

  const t = texts[selectedLanguage] || texts.english;

  const [userId, setUserId] = useState(null);
  const [loadingCars, setLoadingCars] = useState(false);
  const [cars, setCars] = useState([]);
  const [tab, setTab] = useState(vehicleType === 'motorcycle' ? 'motorcycle' : 'car');
  const [selectedCar, setSelectedCar] = useState(null);
  const [videoSelected, setVideoSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState(null);
  const [processError, setProcessError] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('queued');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id || null;
        setUserId(uid);
        if (uid) {
          setLoadingCars(true);
          // getUserCars returns an object { data, nextPage, hasNextPage, totalCount }
          // so we must pass the parameter object and read from res.data
          const res = await carService.getUserCars({ userId: uid, limit: 100 });
          setCars(Array.isArray(res?.data) ? res.data : []);
        }
      } catch (e) {
      } finally {
        setLoadingCars(false);
      }
    })();
  }, []);

  const filteredCars = useMemo(() => {
    return (cars || []).filter(c => (c.vehicle_type || '').toLowerCase() === tab);
  }, [cars, tab]);

  const getDisplayName = (car) => {
    const brandName = car.car_brands?.name || car.moto_brands?.name || car.custom_brand || 'Unknown Brand';
    const modelName = car.car_models?.name || car.moto_models?.name || car.custom_model || 'Unknown Model';
    return `${car.year} ${brandName} ${modelName}`;
  };

  const ensureMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.title, selectedLanguage === 'georgian' ? 'გთხოვთ მიეცით წვდომა მედია ბიბლიოთეკაზე.' : 'Please grant access to your media library.');
      return false;
    }
    return true;
  };

  const pickVideo = async () => {
    const ok = await ensureMediaPermission();
    if (!ok) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset) {
        setVideoSelected({ uri: asset.uri, name: asset.fileName || 'video.mp4', type: asset.type || 'video/mp4' });
      }
    } catch (e) {
      Alert.alert(t.title, selectedLanguage === 'georgian' ? 'ვერ მოხერხდა ვიდეოს არჩევა.' : 'Could not pick a video.');
    }
  };

  const onChooseVideo = () => {
    pickVideo();
  };

  const onChangeVideo = () => {
    pickVideo();
  };

  const onRemoveVideo = () => {
    setVideoSelected(null);
  };

  const renderCarItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.carItem, selectedCar?.id === item.id && styles.carItemActive]}
      onPress={() => setSelectedCar(item)}
    >
      <Ionicons name={tab === 'car' ? 'car-sport' : 'bicycle'} size={18} color={selectedCar?.id === item.id ? '#fff' : '#333'} />
      <Text style={[styles.carItemText, selectedCar?.id === item.id && styles.carItemTextActive]} numberOfLines={1}>
        {getDisplayName(item)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            const returnTab = route?.params?.returnTab;
            if (returnTab && navigation?.navigate) {
              navigation.navigate('MainScreen', { initialTab: returnTab });
            } else {
              navigation?.goBack?.();
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color="#000" />
          <Text style={styles.backText}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
      >
        <View style={styles.subHeader}>
          <Text style={styles.rangePill}>{t.rangeLabel}</Text>
        </View>

        {/* Car/Moto tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity onPress={() => setTab('car')} style={[styles.tabBtn, tab === 'car' && styles.tabActive]}> 
            <Text style={[styles.tabText, tab === 'car' && styles.tabTextActive]}>{t.carTab}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('motorcycle')} style={[styles.tabBtn, tab === 'motorcycle' && styles.tabActive]}>
            <Text style={[styles.tabText, tab === 'motorcycle' && styles.tabTextActive]}>{t.motoTab}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t.selectCarTitle}</Text>

        {/* Car list - using View instead of FlatList for better scrolling */}
        {filteredCars.length === 0 ? (
          <View style={styles.emptyCarsContainer}>
            {!loadingCars && <Text style={styles.emptyText}>{t.noCars}</Text>}
          </View>
        ) : (
          <View style={styles.carsList}>
            {filteredCars.map((item) => (
              <View key={item.id}>
                {renderCarItem({ item })}
              </View>
            ))}
          </View>
        )}

        {/* Video section appears after selecting car */}
        {selectedCar && (
          <View style={styles.videoCard}>
            <View style={styles.videoHeader}>
              <Ionicons name="videocam" size={18} color="#000" />
              <Text style={styles.videoTitle}>{tab === 'car' ? t.carTab : t.motoTab}</Text>
            </View>

            {!videoSelected ? (
              <TouchableOpacity style={styles.videoUploadBtn} onPress={onChooseVideo}>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={styles.videoUploadText}>{t.chooseVideo}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.videoActionsRow}>
                <Text style={styles.videoFileText}>{videoSelected.name}</Text>
                <View style={styles.videoActionsRight}>
                  <TouchableOpacity style={styles.actionLink} onPress={onChangeVideo}>
                    <Text style={styles.actionLinkText}>{t.changeVideo}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionLink} onPress={onRemoveVideo}>
                    <Text style={[styles.actionLinkText, { color: '#e53935' }]}>{t.removeVideo}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.warningBox}>
              <Ionicons name="warning" size={16} color="#b26a00" />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>{t.videoNoteTitle}</Text>
                <Text style={styles.warningText}>{t.videoNote}</Text>
              </View>
            </View>

            {videoSelected && (
              <TouchableOpacity
                style={[styles.videoUploadBtn, { marginTop: 12, opacity: processing ? 0.7 : 1 }]}
                disabled={processing}
                onPress={async () => {
                  if (!selectedCar || !videoSelected) return;
                  setProcessError(null);
                  setProcessResult(null);
                  setProcessing(true);
                  setProgressPercent(0);
                  setProgressStage('queued');
                  try {
                    const providedBrand = selectedCar?.car_brands?.name || selectedCar?.moto_brands?.name || selectedCar?.custom_brand || '';
                    const providedYear = selectedCar?.year || null;
                    // Start async job and show progress while waiting for result
                    const { jobId } = await processorService.startDragyJob({
                      file: videoSelected,
                      vehicleType: tab,
                      range,
                      providedBrand,
                      providedYear,
                    });
                    const result = await processorService.waitForDragyResult(jobId, {
                      intervalMs: 1000,
                      onProgress: (p, stage) => {
                        setProgressPercent(typeof p === 'number' ? p : 0);
                        setProgressStage(stage || 'processing');
                      },
                    });
                    setProcessResult(result);
                    // If validation mismatch, block submission and notify user
                    if (result?.validation?.verdict === 'mismatch') {
                      const msg = selectedLanguage === 'georgian' ? 'ატვირთვა შეუძლებელია: არჩეული მანქანა არ ემთხვევა ვიდეოში აღმოჩენილ ბრენდსა და წელს.' : 'Cannot submit: the selected car does not match the detected brand/year in the video.';
                      setProcessError(msg);
                      try { Alert.alert(t.title, msg); } catch (_) {}
                    }
                    // Also block submission if best time is missing (N/A)
                    const timeMissing = result?.summary?.best_elapsed_ms == null;
                    const brandMissing = !result?.summary?.brand;
                    const yearMissing = !result?.summary?.year;
                    if (timeMissing) {
                      const msgTime = (brandMissing && yearMissing)
                        ? (selectedLanguage === 'georgian'
                            ? 'ატვირთვა შეუძლებელია: ატვირთეთ სწორი ვიდეო (ვერ განისაზღვრა დრო/ბრენდი/წელი).'
                            : 'Cannot submit: please upload the correct video (time/brand/year not detected).')
                        : (selectedLanguage === 'georgian'
                            ? 'ატვირთვა შეუძლებელია: დრო ვერ იქნა დადგენილი ვიდეოდან.'
                            : 'Cannot submit: time could not be detected from the video.');
                      setProcessError(msgTime);
                      try { Alert.alert(t.title, msgTime); } catch (_) {}
                    }

                  } catch (e) {
                    setProcessError(e?.message || 'Processing failed');
                  } finally {
                    setProcessing(false);
                  }
                }}
              >
                <Ionicons name={processing ? 'hourglass' : 'checkmark'} size={16} color="#fff" />
                <Text style={styles.videoUploadText}>
                  {processing
                    ? `${progressPercent}% ${selectedLanguage === 'georgian' ? 'მუშავდება' : 'Processing'}`
                    : t.process}
                </Text>
              </TouchableOpacity>
            )}

            {/* Progress UI */}
            {processing && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
                </View>
                <Text style={{ marginTop: 6, fontSize: 12, color: '#444' }}>{progressStage}</Text>
              </View>
            )}

            {/* Show processing outcome */}
            {processError && (
              <Text style={{ color: '#e53935', marginTop: 10, fontSize: 12 }}>{processError}</Text>
            )}
            {processResult && (
              <View style={{ marginTop: 12, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontWeight: '700', marginBottom: 6 }}>
                  {selectedLanguage === 'georgian' ? 'დამუშავებული მონაცემები' : 'Detected Data'}
                </Text>
                <Text style={styles.resultRow}>
                  {selectedLanguage === 'georgian' ? 'ვიდეო ფაილი:' : 'Video file:'} {processResult?.video?.filename}
                </Text>
                <Text style={styles.resultRow}>
                  {selectedLanguage === 'georgian' ? 'დიაპაზონი:' : 'Range:'} {processResult?.summary?.range}
                </Text>
                <Text style={styles.resultRow}>
                  {selectedLanguage === 'georgian' ? 'საუკეთესო დრო:' : 'Best time:'} {(
                    processResult?.summary?.best_elapsed_ms != null
                      ? (processResult.summary.best_elapsed_ms / 1000).toFixed(2) + 's'
                      : 'N/A'
                  )}
                </Text>
                <Text style={styles.resultRow}>
                  {selectedLanguage === 'georgian' ? 'წელი/ბრენდი:' : 'Year/Brand:'} {processResult?.summary?.year || ''} {processResult?.summary?.brand || ''}
                </Text>

                {/* Validation verdict */}
                {processResult?.validation && (
                  (() => {
                    const timePresent = processResult?.summary?.best_elapsed_ms != null;
                    const effectiveOk = processResult?.validation?.verdict === 'ok' && timePresent;
                    const bg = effectiveOk ? '#E8F5E9' : '#FFEBEE';
                    const fg = effectiveOk ? '#2E7D32' : '#C62828';
                    const title = effectiveOk
                      ? (selectedLanguage === 'georgian' ? 'ვერიფიკაცია: შესაბამისობა' : 'Verification: Match')
                      : (selectedLanguage === 'georgian' ? 'ვერიფიკაცია: შეუსაბამობა' : 'Verification: Mismatch');
                    return (
                      <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: bg }}>
                        <Text style={{ fontWeight: '700', color: fg }}>{title}</Text>
                        {Array.isArray(processResult.validation.reasons) && processResult.validation.reasons.map((r, idx) => (
                          <Text key={idx} style={{ fontSize: 12, color: fg }}>• {r}</Text>
                        ))}
                        {!timePresent && (
                          <Text style={{ fontSize: 12, color: fg }}>• {selectedLanguage === 'georgian' ? 'დრო არ არის გამოვლენილი' : 'Time not detected'}</Text>
                        )}
                      </View>
                    );
                  })()
                )}
                {/* Submit button shows only when effective verification is OK (server OK + time present) */}
                {(() => {
                  const timePresent = processResult?.summary?.best_elapsed_ms != null;
                  const effectiveOk = processResult?.validation?.verdict === 'ok' && timePresent;
                  return effectiveOk;
                })() && (
                  <TouchableOpacity
                    style={[styles.videoUploadBtn, { marginTop: 12, opacity: submitting ? 0.7 : 1 }]}
                    disabled={submitting}
                    onPress={async () => {
                      try {
                        if (!userId) {
                          throw new Error(selectedLanguage === 'georgian' ? 'მომხმარებელი ავტორიზებული არაა' : 'User not authenticated');
                        }
                        if (!selectedCar || !videoSelected) {
                          throw new Error(selectedLanguage === 'georgian' ? 'აირჩიეთ მანქანა და ვიდეო' : 'Select a car and a video');
                        }
                        setSubmitError(null);
                        setSubmitSuccess(false);
                        setSubmitting(true);

                        // Read username from auth metadata (used later for insert/update)
                        const { data: userResp } = await supabase.auth.getUser();
                        const username = userResp?.user?.user_metadata?.username || null;

                        // Compute normalized range fields for dashboards
                        const computeRange = (vt, r) => {
                          // vt: 'car' | 'motorcycle'; r: incoming route range string
                          let speed_unit = vt === 'motorcycle' ? 'mph' : 'kmh';
                          let range_start = null;
                          let range_end = null;
                          let range_label = r;
                          const norm = (s) => (s || '').toLowerCase();
                          const rr = norm(r);
                          if (vt === 'car') {
                            if (rr === '0-100') { range_start = 0; range_end = 100; range_label = '0-100'; }
                            else if (rr === '100-200') { range_start = 100; range_end = 200; range_label = '100-200'; }
                            else if (rr === '0-200') { range_start = 0; range_end = 200; range_label = '0-200'; }
                          } else { // motorcycle in mph
                            if (rr === '0-60mph' || rr === '0-100') { range_start = 0; range_end = 60; range_label = '0-60mph'; }
                            else if (rr === '60-124mph' || rr === '100-200' || rr === '60-124') { range_start = 60; range_end = 124; range_label = '60-124mph'; }
                            else if (rr === '0-200' || rr === '0-124mph') { range_start = 0; range_end = 124; range_label = '0-124mph'; }
                          }
                          return { speed_unit, range_start, range_end, range_label };
                        };

                        const { speed_unit, range_start, range_end, range_label } = computeRange(tab, range);

                        // Prepare row fields
                        const summary = processResult?.summary || {};
                        const bestElapsed = summary?.best_elapsed_ms ?? null;
                        const detectedBrand = summary?.brand || null;
                        const detectedYear = summary?.year || null;

                        // Helper to confirm overwrite if slower
                        const confirmAsync = (title, message, okText, cancelText) => new Promise((resolve) => {
                          try {
                            Alert.alert(title, message, [
                              { text: cancelText || (selectedLanguage === 'georgian' ? 'გაუქმება' : 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
                              { text: okText || (selectedLanguage === 'georgian' ? 'დადასტურება' : 'Confirm'), onPress: () => resolve(true) },
                            ], { cancelable: true });
                          } catch (_) { resolve(false); }
                        });

                        // 1) Check for existing run
                        const { data: existingRows, error: selErr } = await supabase
                          .from('video_runs')
                          .select('*')
                          .eq('user_id', userId)
                          .eq('car_id', selectedCar.id)
                          .eq('vehicle_type', tab)
                          .eq('speed_unit', speed_unit)
                          .eq('range_start', range_start)
                          .eq('range_end', range_end)
                          .limit(1);
                        if (selErr) throw selErr;
                        const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

                        // Decide whether to proceed and whether to update existing or insert new
                        let proceed = true;
                        let doUpdate = false;
                        if (existing) {
                          doUpdate = true;
                          const oldMs = existing.best_elapsed_ms;
                          const faster = (bestElapsed != null && (oldMs == null || bestElapsed < oldMs));
                          if (!faster) {
                            const msg = selectedLanguage === 'georgian'
                              ? 'ახალი შედეგი ძველზე უარესია. გსურთ ჩანაცვლება?' 
                              : 'Your new result is slower than your previous one. Replace it?';
                            proceed = await confirmAsync(t.title, msg, selectedLanguage === 'georgian' ? 'დიახ' : 'Yes', selectedLanguage === 'georgian' ? 'არა' : 'No');
                          }
                        }

                        if (!proceed) {
                          setSubmitting(false);
                          return;
                        }

                        // 2) Upload to private bucket AFTER decision to avoid orphan files
                        const bucket = 'dragy-uploads';
                        const safeName = (videoSelected.name || 'video.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
                        const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        const key = `${userId}/${selectedCar.id}/${runId}/${safeName}`;
                        const resp = await fetch(videoSelected.uri);
                        const arrayBuffer = await resp.arrayBuffer();
                        const fileBytes = new Uint8Array(arrayBuffer);
                        const { error: upErr } = await supabase
                          .storage
                          .from(bucket)
                          .upload(key, fileBytes, {
                            cacheControl: '3600',
                            upsert: false,
                            contentType: videoSelected.type || 'video/mp4',
                          });
                        if (upErr) throw upErr;

                        // 3) Insert or Update row
                        if (doUpdate && existing) {
                          const { error: updErr } = await supabase
                            .from('video_runs')
                            .update({
                              user_username: username,
                              range: range_label || range,
                              video_bucket: bucket,
                              video_path: key,
                              processing_summary: processResult,
                              best_elapsed_ms: bestElapsed,
                              detected_brand: detectedBrand,
                              detected_year: detectedYear,
                              verification_verdict: 'ok',
                            })
                            .eq('id', existing.id);
                          if (updErr) throw updErr;
                        } else {
                          const { error: insErr } = await supabase
                            .from('video_runs')
                            .insert({
                              user_id: userId,
                              user_username: username,
                              car_id: selectedCar.id,
                              vehicle_type: tab,
                              range: range_label || range,
                              speed_unit,
                              range_start,
                              range_end,
                              video_bucket: bucket,
                              video_path: key,
                              processing_summary: processResult,
                              best_elapsed_ms: bestElapsed,
                              detected_brand: detectedBrand,
                              detected_year: detectedYear,
                              verification_verdict: 'ok',
                            });
                          if (insErr) throw insErr;
                        }

                        setSubmitSuccess(true);
                        try {
                          Alert.alert(
                            t.title,
                            selectedLanguage === 'georgian' ? 'ვიდეო წარმატებით აიტვირთა და დაემატა.' : 'Video submitted and saved successfully.'
                          );
                        } catch (_) {}
                      } catch (e) {
                        const msg = e?.message || 'Submit failed';
                        setSubmitError(msg);
                        try { Alert.alert(t.title, msg); } catch (_) {}
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    <Ionicons name={submitting ? 'hourglass' : 'cloud-upload'} size={16} color="#fff" />
                    <Text style={styles.videoUploadText}>
                      {submitting
                        ? (selectedLanguage === 'georgian' ? 'იტვირთება...' : 'Submitting...')
                        : (selectedLanguage === 'georgian' ? 'გაგზავნე შენი ვიდეო' : 'Submit your video')}
                    </Text>
                  </TouchableOpacity>
                )}

                {submitError && (
                  <Text style={{ color: '#e53935', marginTop: 8, fontSize: 12 }}>{submitError}</Text>
                )}
                {submitSuccess && (
                  <Text style={{ color: '#2E7D32', marginTop: 8, fontSize: 12 }}>
                    {selectedLanguage === 'georgian' ? 'დამატებულია თქვენს დაფაზე.' : 'Added to your dashboard.'}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  
  backText: {
    color: '#000000',
    fontSize: 16,
    marginLeft: 4,
    fontWeight: '500',
  },
  
  headerTitle: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  
  subHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  
  rangePill: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    textAlign: 'center',
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  tabActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  
  tabText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  
  tabTextActive: {
    color: '#ffffff',
  },
  
  sectionTitle: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
  },
  
  emptyCarsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#ffffff',
  },
  
  carItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  carItemActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  carItemText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  
  carItemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  
  emptyText: {
    color: '#666666',
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  videoCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  
  videoTitle: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  
  videoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 8,
  },
  
  videoUploadText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  
  videoActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  videoFileText: {
    color: '#000000',
    fontSize: 5,
    fontWeight: '500',
    flex: 1,
  },
  
  videoActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  actionLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  
  actionLinkText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#b26a00',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  warningTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 8,
  },
  
  warningText: {
    color: '#333333',
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 8,
  },
  
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  
  progressFill: {
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 2,
  },
  
  resultRow: {
    color: '#000000',
    fontSize: 10,
    marginBottom: 4,
    lineHeight: 20,
  },
});
export default UploadResultScreen;
