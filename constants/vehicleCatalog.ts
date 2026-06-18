export const FALLBACK_BRANDS = [
  { id: 1,  name: 'Toyota',       nameAr: 'تويوتا',      serviceType: 'all', isChinese: false },
  { id: 2,  name: 'Hyundai',      nameAr: 'هيونداي',     serviceType: 'all', isChinese: false },
  { id: 3,  name: 'Kia',          nameAr: 'كيا',          serviceType: 'all', isChinese: false },
  { id: 4,  name: 'Nissan',       nameAr: 'نيسان',        serviceType: 'all', isChinese: false },
  { id: 5,  name: 'Honda',        nameAr: 'هوندا',        serviceType: 'all', isChinese: false },
  { id: 6,  name: 'Chevrolet',    nameAr: 'شيفروليه',    serviceType: 'all', isChinese: false },
  { id: 7,  name: 'Mitsubishi',   nameAr: 'ميتسوبيشي',  serviceType: 'all', isChinese: false },
  { id: 8,  name: 'Suzuki',       nameAr: 'سوزوكي',      serviceType: 'all', isChinese: false },
  { id: 9,  name: 'BMW',          nameAr: 'بي إم دبليو', serviceType: 'all', isChinese: false },
  { id: 10, name: 'Mercedes-Benz',nameAr: 'مرسيدس',      serviceType: 'all', isChinese: false },
  { id: 11, name: 'Volkswagen',   nameAr: 'فولكس واجن',  serviceType: 'all', isChinese: false },
  { id: 12, name: 'Ford',         nameAr: 'فورد',         serviceType: 'all', isChinese: false },
  { id: 13, name: 'Peugeot',      nameAr: 'بيجو',         serviceType: 'all', isChinese: false },
  { id: 14, name: 'Renault',      nameAr: 'رينو',         serviceType: 'all', isChinese: false },
  { id: 15, name: 'Skoda',        nameAr: 'سكودا',        serviceType: 'all', isChinese: false },
  { id: 16, name: 'Opel',         nameAr: 'أوبل',         serviceType: 'all', isChinese: false },
  { id: 17, name: 'Lada',         nameAr: 'لادا',         serviceType: 'all', isChinese: false },
  { id: 18, name: 'Fiat',         nameAr: 'فيات',         serviceType: 'all', isChinese: false },
  { id: 19, name: 'Jeep',         nameAr: 'جيب',          serviceType: 'all', isChinese: false },
  { id: 20, name: 'Subaru',       nameAr: 'سوبارو',       serviceType: 'all', isChinese: false },
  { id: 21, name: 'MAN',          nameAr: 'مان',          serviceType: 'all', isChinese: false },
  { id: 22, name: 'Yutong',       nameAr: 'يوتونغ',       serviceType: 'all', isChinese: true  },
  { id: 23, name: 'Higer',        nameAr: 'هايغر',        serviceType: 'all', isChinese: true  },
  { id: 24, name: 'King Long',    nameAr: 'كينج لونغ',    serviceType: 'all', isChinese: true  },
  { id: 25, name: 'Golden Dragon',nameAr: 'جولدن دراغون', serviceType: 'all', isChinese: true  },
];

// Models keyed by brandId — covers common vehicles used in Egypt shuttle/transport
const _MODELS: Array<{ id: number; brandId: number; name: string; nameAr: string | null; minYear: number; maxYear: number | null; seatCapacity: number | null }> = [
  // Toyota (1)
  { id: 101, brandId: 1, name: 'Coaster',      nameAr: 'كوستر',      minYear: 2000, maxYear: null, seatCapacity: 30 },
  { id: 102, brandId: 1, name: 'Hiace',        nameAr: 'هايس',       minYear: 2000, maxYear: null, seatCapacity: 15 },
  { id: 103, brandId: 1, name: 'Land Cruiser', nameAr: 'لاند كروزر', minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 104, brandId: 1, name: 'Camry',        nameAr: 'كامري',      minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 105, brandId: 1, name: 'Corolla',      nameAr: 'كورولا',     minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 106, brandId: 1, name: 'Yaris',        nameAr: 'ياريس',      minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 107, brandId: 1, name: 'Fortuner',     nameAr: 'فورتشنر',    minYear: 2006, maxYear: null, seatCapacity: null },
  // Hyundai (2)
  { id: 201, brandId: 2, name: 'H350',         nameAr: 'H350',       minYear: 2015, maxYear: null, seatCapacity: 18 },
  { id: 202, brandId: 2, name: 'County',       nameAr: 'كاونتي',     minYear: 2005, maxYear: null, seatCapacity: 28 },
  { id: 203, brandId: 2, name: 'Starex',       nameAr: 'ستاركس',     minYear: 2005, maxYear: null, seatCapacity: 12 },
  { id: 204, brandId: 2, name: 'Elantra',      nameAr: 'إيلانترا',   minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 205, brandId: 2, name: 'Tucson',       nameAr: 'توسان',      minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 206, brandId: 2, name: 'Sonata',       nameAr: 'سوناتا',     minYear: 2006, maxYear: null, seatCapacity: null },
  // Kia (3)
  { id: 301, brandId: 3, name: 'Besta',        nameAr: 'بيستا',      minYear: 2005, maxYear: null, seatCapacity: 15 },
  { id: 302, brandId: 3, name: 'Grand Carnival',nameAr:'جراند كارنيفال',minYear:2010,maxYear:null,seatCapacity:11},
  { id: 303, brandId: 3, name: 'Sportage',     nameAr: 'سبورتاج',    minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 304, brandId: 3, name: 'Cerato',       nameAr: 'سيراتو',     minYear: 2006, maxYear: null, seatCapacity: null },
  // Nissan (4)
  { id: 401, brandId: 4, name: 'Urvan',        nameAr: 'ارفان',      minYear: 2005, maxYear: null, seatCapacity: 15 },
  { id: 402, brandId: 4, name: 'Patrol',       nameAr: 'باترول',     minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 403, brandId: 4, name: 'Sunny',        nameAr: 'صني',        minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 404, brandId: 4, name: 'Sentra',       nameAr: 'سنترا',      minYear: 2006, maxYear: null, seatCapacity: null },
  // Honda (5)
  { id: 501, brandId: 5, name: 'Civic',        nameAr: 'سيفيك',      minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 502, brandId: 5, name: 'Accord',       nameAr: 'أكورد',      minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 503, brandId: 5, name: 'CR-V',         nameAr: 'CR-V',       minYear: 2007, maxYear: null, seatCapacity: null },
  // Mitsubishi (7)
  { id: 701, brandId: 7, name: 'Rosa',         nameAr: 'روزا',       minYear: 2005, maxYear: null, seatCapacity: 28 },
  { id: 702, brandId: 7, name: 'Canter',       nameAr: 'كانتر',      minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 703, brandId: 7, name: 'Lancer',       nameAr: 'لانسر',      minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 704, brandId: 7, name: 'Galant',       nameAr: 'جالانت',     minYear: 2005, maxYear: null, seatCapacity: null },
  // Mercedes-Benz (10)
  { id: 1001, brandId: 10, name: 'Sprinter',   nameAr: 'سبرينتر',    minYear: 2005, maxYear: null, seatCapacity: 16 },
  { id: 1002, brandId: 10, name: 'Vito',       nameAr: 'فيتو',       minYear: 2006, maxYear: null, seatCapacity: 8  },
  { id: 1003, brandId: 10, name: 'C-Class',    nameAr: 'C-Class',    minYear: 2008, maxYear: null, seatCapacity: null },
  { id: 1004, brandId: 10, name: 'E-Class',    nameAr: 'E-Class',    minYear: 2008, maxYear: null, seatCapacity: null },
  // Volkswagen (11)
  { id: 1101, brandId: 11, name: 'Crafter',    nameAr: 'كرافتر',     minYear: 2007, maxYear: null, seatCapacity: 16 },
  { id: 1102, brandId: 11, name: 'Transporter',nameAr:'ترانسبورتر',  minYear: 2006, maxYear: null, seatCapacity: 9  },
  { id: 1103, brandId: 11, name: 'Passat',     nameAr: 'باسات',      minYear: 2006, maxYear: null, seatCapacity: null },
  // MAN (21)
  { id: 2101, brandId: 21, name: 'Lion\'s Coach',nameAr:'ليونز كوتش',minYear:2010, maxYear:null, seatCapacity:55},
  { id: 2102, brandId: 21, name: 'Lion\'s City', nameAr:'ليونز سيتي', minYear:2010, maxYear:null, seatCapacity:70},
  // Yutong (22)
  { id: 2201, brandId: 22, name: 'ZK6122H9',  nameAr: 'ZK6122H9',   minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 2202, brandId: 22, name: 'ZK6109H',   nameAr: 'ZK6109H',    minYear: 2010, maxYear: null, seatCapacity: 45 },
  { id: 2203, brandId: 22, name: 'ZK6938H',   nameAr: 'ZK6938H',    minYear: 2012, maxYear: null, seatCapacity: 35 },
  // Higer (23)
  { id: 2301, brandId: 23, name: 'KLQ6129Q',  nameAr: 'KLQ6129Q',   minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 2302, brandId: 23, name: 'KLQ6119Q',  nameAr: 'KLQ6119Q',   minYear: 2010, maxYear: null, seatCapacity: 45 },
  // King Long (24)
  { id: 2401, brandId: 24, name: 'XMQ6127Y',  nameAr: 'XMQ6127Y',   minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 2402, brandId: 24, name: 'XMQ6900',   nameAr: 'XMQ6900',    minYear: 2010, maxYear: null, seatCapacity: 35 },
  // Golden Dragon (25)
  { id: 2501, brandId: 25, name: 'XML6127',   nameAr: 'XML6127',    minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 2502, brandId: 25, name: 'XML6103',   nameAr: 'XML6103',    minYear: 2010, maxYear: null, seatCapacity: 45 },
];

/**
 * Returns fallback models for a given brandId.
 * Falls back to a generic list if the brand has no specific models defined.
 */
export function getFallbackModels(brandId: number) {
  const specific = _MODELS.filter(m => m.brandId === brandId);
  if (specific.length > 0) return specific;
  // Generic fallback for brands with no specific model list
  return [
    { id: 9001, brandId, name: 'Standard Model', nameAr: 'موديل قياسي', minYear: 2005, maxYear: null, seatCapacity: null },
  ];
}

/**
 * Returns a generic year range as fallback for any model.
 * Covers 2005 → current year.
 */
export function getFallbackYears(): Array<{ id: number | null; year: number; pricingCategory: string | null }> {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= 2005; y--) {
    years.push({ id: null, year: y, pricingCategory: null });
  }
  return years;
}

export const FALLBACK_COLORS = [
  { id: 1,  nameEn: 'White',   nameAr: 'أبيض',   hexCode: '#FFFFFF' },
  { id: 2,  nameEn: 'Black',   nameAr: 'أسود',   hexCode: '#1e1e28' },
  { id: 3,  nameEn: 'Silver',  nameAr: 'فضي',    hexCode: '#C0C0C0' },
  { id: 4,  nameEn: 'Gray',    nameAr: 'رمادي',  hexCode: '#808080' },
  { id: 5,  nameEn: 'Red',     nameAr: 'أحمر',   hexCode: '#E53935' },
  { id: 6,  nameEn: 'Blue',    nameAr: 'أزرق',   hexCode: '#1565C0' },
  { id: 7,  nameEn: 'Green',   nameAr: 'أخضر',   hexCode: '#388E3C' },
  { id: 8,  nameEn: 'Beige',   nameAr: 'بيج',    hexCode: '#D4B896' },
  { id: 9,  nameEn: 'Brown',   nameAr: 'بني',    hexCode: '#795548' },
  { id: 10, nameEn: 'Gold',    nameAr: 'ذهبي',   hexCode: '#FFC107' },
  { id: 11, nameEn: 'Orange',  nameAr: 'برتقالي',hexCode: '#F57C00' },
  { id: 12, nameEn: 'Maroon',  nameAr: 'كستنائي',hexCode: '#880E4F' },
  { id: 13, nameEn: 'Navy',    nameAr: 'كحلي',   hexCode: '#0D1B4B' },
  { id: 14, nameEn: 'Pearl',   nameAr: 'لؤلؤي',  hexCode: '#F5F0E8' },
];
