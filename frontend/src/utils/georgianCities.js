// Georgian cities and regions for location detection
export const GEORGIAN_CITIES = [
  // Major cities
  { name: 'Tbilisi', nameKa: 'თბილისი', region: 'Tbilisi', lat: 41.7151, lng: 44.8271 },
  { name: 'Kutaisi', nameKa: 'ქუთაისი', region: 'Imereti', lat: 42.2679, lng: 42.6961 },
  { name: 'Batumi', nameKa: 'ბათუმი', region: 'Adjara', lat: 41.6168, lng: 41.6367 },
  { name: 'Rustavi', nameKa: 'რუსთავი', region: 'Kvemo Kartli', lat: 41.5492, lng: 44.9993 },
  { name: 'Gori', nameKa: 'გორი', region: 'Shida Kartli', lat: 41.9847, lng: 44.1086 },
  { name: 'Zugdidi', nameKa: 'ზუგდიდი', region: 'Samegrelo', lat: 42.5088, lng: 41.8709 },
  { name: 'Poti', nameKa: 'ფოთი', region: 'Samegrelo', lat: 42.1479, lng: 41.6736 },
  { name: 'Kobuleti', nameKa: 'ქობულეთი', region: 'Adjara', lat: 41.8167, lng: 41.7833 },
  { name: 'Khashuri', nameKa: 'ხაშური', region: 'Shida Kartli', lat: 41.9944, lng: 43.6006 },
  { name: 'Samtredia', nameKa: 'სამტრედია', region: 'Imereti', lat: 42.1594, lng: 42.3336 },
  
  // Additional important cities
  { name: 'Telavi', nameKa: 'თელავი', region: 'Kakheti', lat: 41.9167, lng: 45.4667 },
  { name: 'Akhalkalaki', nameKa: 'ახალქალაქი', region: 'Samtskhe-Javakheti', lat: 41.4058, lng: 43.4831 },
  { name: 'Senaki', nameKa: 'სენაკი', region: 'Samegrelo', lat: 42.2667, lng: 42.0667 },
  { name: 'Zestaponi', nameKa: 'ზესტაფონი', region: 'Imereti', lat: 42.1094, lng: 43.0556 },
  { name: 'Marneuli', nameKa: 'მარნეული', region: 'Kvemo Kartli', lat: 41.4775, lng: 44.8094 },
  { name: 'Gardabani', nameKa: 'გარდაბანი', region: 'Kvemo Kartli', lat: 41.4583, lng: 45.0917 },
  { name: 'Borjomi', nameKa: 'ბორჯომი', region: 'Samtskhe-Javakheti', lat: 41.8406, lng: 43.3831 },
  { name: 'Akhaltsikhe', nameKa: 'ახალციხე', region: 'Samtskhe-Javakheti', lat: 41.6394, lng: 42.9831 },
  { name: 'Ozurgeti', nameKa: 'ოზურგეთი', region: 'Guria', lat: 41.9225, lng: 42.0058 },
  { name: 'Signagi', nameKa: 'სიღნაღი', region: 'Kakheti', lat: 41.6167, lng: 45.9167 },
  { name: 'Mtskheta', nameKa: 'მცხეთა', region: 'Mtskheta-Mtianeti', lat: 41.8458, lng: 44.7208 },
  { name: 'Kaspi', nameKa: 'კასპი', region: 'Shida Kartli', lat: 41.9167, lng: 44.4167 },
  { name: 'Kareli', nameKa: 'ქარელი', region: 'Shida Kartli', lat: 42.0167, lng: 43.8500 },
  { name: 'Sachkhere', nameKa: 'საჩხერე', region: 'Imereti', lat: 42.3406, lng: 43.4069 },
  { name: 'Chiatura', nameKa: 'ჭიათურა', region: 'Imereti', lat: 42.2981, lng: 43.2856 },
  { name: 'Tkibuli', nameKa: 'ტყიბული', region: 'Imereti', lat: 42.3381, lng: 43.0006 },
  { name: 'Baghdati', nameKa: 'ბაღდათი', region: 'Imereti', lat: 42.0806, lng: 42.8181 },
  { name: 'Vani', nameKa: 'ვანი', region: 'Imereti', lat: 42.0831, lng: 42.5181 },
  { name: 'Khoni', nameKa: 'ხონი', region: 'Imereti', lat: 42.3181, lng: 42.4331 },
  { name: 'Terjola', nameKa: 'თერჯოლა', region: 'Imereti', lat: 42.1681, lng: 42.9331 },
  { name: 'Lanchkhuti', nameKa: 'ლანჩხუთი', region: 'Guria', lat: 42.0831, lng: 42.1181 },
  { name: 'Chokhatauri', nameKa: 'ჩოხატაური', region: 'Guria', lat: 42.0331, lng: 42.3181 },
  { name: 'Abasha', nameKa: 'აბაშა', region: 'Samegrelo', lat: 42.2006, lng: 42.2181 },
  { name: 'Martvili', nameKa: 'მარტვილი', region: 'Samegrelo', lat: 42.4181, lng: 42.3831 },
  { name: 'Jvari', nameKa: 'ჯვარი', region: 'Samegrelo', lat: 42.5331, lng: 41.9681 },
  { name: 'Khobi', nameKa: 'ხობი', region: 'Samegrelo', lat: 42.3181, lng: 41.9331 },
  { name: 'Tsalenjikha', nameKa: 'წალენჯიხა', region: 'Samegrelo', lat: 42.6181, lng: 42.0831 },
  { name: 'Chkhorotsku', nameKa: 'ჩხოროწყუ', region: 'Samegrelo', lat: 42.5331, lng: 42.2681 },
  { name: 'Kvareli', nameKa: 'ყვარელი', region: 'Kakheti', lat: 41.9500, lng: 45.8167 },
  { name: 'Lagodekhi', nameKa: 'ლაგოდეხი', region: 'Kakheti', lat: 41.8167, lng: 46.2833 },
  { name: 'Sagarejo', nameKa: 'საგარეჯო', region: 'Kakheti', lat: 41.7333, lng: 45.3333 },
  { name: 'Gurjaani', nameKa: 'გურჯაანი', region: 'Kakheti', lat: 41.7333, lng: 45.8000 },
  { name: 'Dedoplistskaro', nameKa: 'დედოფლისწყარო', region: 'Kakheti', lat: 41.4667, lng: 46.1167 },
  { name: 'Akhmeta', nameKa: 'ახმეტა', region: 'Kakheti', lat: 42.0333, lng: 45.2167 },
  { name: 'Tianeti', nameKa: 'თიანეთი', region: 'Mtskheta-Mtianeti', lat: 42.0667, lng: 44.9667 },
  { name: 'Dusheti', nameKa: 'დუშეთი', region: 'Mtskheta-Mtianeti', lat: 42.0833, lng: 44.7167 },
  { name: 'Kazbegi', nameKa: 'ყაზბეგი', region: 'Mtskheta-Mtianeti', lat: 42.6583, lng: 44.6417 },
  { name: 'Bolnisi', nameKa: 'ბოლნისი', region: 'Kvemo Kartli', lat: 41.4500, lng: 44.5333 },
  { name: 'Dmanisi', nameKa: 'დმანისი', region: 'Kvemo Kartli', lat: 41.3333, lng: 44.3500 },
  { name: 'Tsalka', nameKa: 'წალკა', region: 'Kvemo Kartli', lat: 41.5833, lng: 44.0833 },
  { name: 'Tetritskaro', nameKa: 'თეთრიწყარო', region: 'Kvemo Kartli', lat: 41.6000, lng: 44.4667 },
  { name: 'Aspindza', nameKa: 'ასპინძა', region: 'Samtskhe-Javakheti', lat: 41.5667, lng: 43.2500 },
  { name: 'Adigeni', nameKa: 'ადიგენი', region: 'Samtskhe-Javakheti', lat: 41.6833, lng: 42.7000 },
  { name: 'Ninotsminda', nameKa: 'ნინოწმინდა', region: 'Samtskhe-Javakheti', lat: 41.2833, lng: 43.5833 },
  { name: 'Keda', nameKa: 'ქედა', region: 'Adjara', lat: 41.4833, lng: 41.8667 },
  { name: 'Shuakhevi', nameKa: 'შუახევი', region: 'Adjara', lat: 41.5333, lng: 42.2000 },
  { name: 'Khelvachauri', nameKa: 'ხელვაჩაური', region: 'Adjara', lat: 41.5833, lng: 41.6333 },
  { name: 'Khulo', nameKa: 'ხულო', region: 'Adjara', lat: 41.6500, lng: 42.2833 }
];

export const GEORGIAN_REGIONS = [
  { name: 'Tbilisi', nameKa: 'თბილისი' },
  { name: 'Adjara', nameKa: 'აჭარა' },
  { name: 'Guria', nameKa: 'გურია' },
  { name: 'Imereti', nameKa: 'იმერეთი' },
  { name: 'Kakheti', nameKa: 'კახეთი' },
  { name: 'Kvemo Kartli', nameKa: 'ქვემო ქართლი' },
  { name: 'Mtskheta-Mtianeti', nameKa: 'მცხეთა-მთიანეთი' },
  { name: 'Racha-Lechkhumi', nameKa: 'რაჭა-ლეჩხუმი' },
  { name: 'Samegrelo', nameKa: 'სამეგრელო' },
  { name: 'Samtskhe-Javakheti', nameKa: 'სამცხე-ჯავახეთი' },
  { name: 'Shida Kartli', nameKa: 'შიდა ქართლი' }
];

// Calculate distance between two coordinates using Haversine formula
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

// Find nearest city based on coordinates
export const findNearestCity = (latitude, longitude) => {
  let nearestCity = null;
  let minDistance = Infinity;
  
  GEORGIAN_CITIES.forEach(city => {
    const distance = calculateDistance(latitude, longitude, city.lat, city.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = { ...city, distance };
    }
  });
  
  return nearestCity;
};

// Get cities within radius (km)
export const getCitiesWithinRadius = (latitude, longitude, radiusKm = 50) => {
  return GEORGIAN_CITIES.filter(city => {
    const distance = calculateDistance(latitude, longitude, city.lat, city.lng);
    return distance <= radiusKm;
  }).map(city => ({
    ...city,
    distance: calculateDistance(latitude, longitude, city.lat, city.lng)
  })).sort((a, b) => a.distance - b.distance);
};
