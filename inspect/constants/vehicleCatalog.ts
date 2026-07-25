// ─── Brands ───────────────────────────────────────────────────────────────────

type FallbackBrand = {
  id: number;
  name: string;
  nameAr: string;
  serviceType: string; // 'shuttle' | 'car' | 'scooter' | 'delivery' | 'all'
  isChinese: boolean;
};

const ALL_BRANDS: FallbackBrand[] = [
  // ── Shuttle / minibus / bus brands ────────────────────────────────────────
  { id: 101, name: 'Toyota',        nameAr: 'تويوتا',       serviceType: 'shuttle', isChinese: false },
  { id: 102, name: 'Hyundai',       nameAr: 'هيونداي',      serviceType: 'shuttle', isChinese: false },
  { id: 103, name: 'Mitsubishi',    nameAr: 'ميتسوبيشي',   serviceType: 'shuttle', isChinese: false },
  { id: 104, name: 'Mercedes-Benz', nameAr: 'مرسيدس',       serviceType: 'shuttle', isChinese: false },
  { id: 105, name: 'Volkswagen',    nameAr: 'فولكس واجن',   serviceType: 'shuttle', isChinese: false },
  { id: 106, name: 'Nissan',        nameAr: 'نيسان',         serviceType: 'shuttle', isChinese: false },
  { id: 107, name: 'Kia',           nameAr: 'كيا',           serviceType: 'shuttle', isChinese: false },
  { id: 108, name: 'Ford',          nameAr: 'فورد',          serviceType: 'shuttle', isChinese: false },
  { id: 109, name: 'Isuzu',         nameAr: 'ايسوزو',        serviceType: 'shuttle', isChinese: false },
  { id: 110, name: 'MAN',           nameAr: 'مان',           serviceType: 'shuttle', isChinese: false },
  { id: 111, name: 'Yutong',        nameAr: 'يوتونغ',        serviceType: 'shuttle', isChinese: true  },
  { id: 112, name: 'Higer',         nameAr: 'هايغر',         serviceType: 'shuttle', isChinese: true  },
  { id: 113, name: 'King Long',     nameAr: 'كينج لونغ',     serviceType: 'shuttle', isChinese: true  },
  { id: 114, name: 'Golden Dragon', nameAr: 'جولدن دراغون',  serviceType: 'shuttle', isChinese: true  },
  { id: 115, name: 'Zhongtong',     nameAr: 'زونغتونغ',      serviceType: 'shuttle', isChinese: true  },

  // ── Car brands ────────────────────────────────────────────────────────────
  { id: 201, name: 'Toyota',        nameAr: 'تويوتا',       serviceType: 'car', isChinese: false },
  { id: 202, name: 'Hyundai',       nameAr: 'هيونداي',      serviceType: 'car', isChinese: false },
  { id: 203, name: 'Kia',           nameAr: 'كيا',           serviceType: 'car', isChinese: false },
  { id: 204, name: 'Nissan',        nameAr: 'نيسان',         serviceType: 'car', isChinese: false },
  { id: 205, name: 'Honda',         nameAr: 'هوندا',         serviceType: 'car', isChinese: false },
  { id: 206, name: 'Chevrolet',     nameAr: 'شيفروليه',     serviceType: 'car', isChinese: false },
  { id: 207, name: 'Mitsubishi',    nameAr: 'ميتسوبيشي',   serviceType: 'car', isChinese: false },
  { id: 208, name: 'Suzuki',        nameAr: 'سوزوكي',       serviceType: 'car', isChinese: false },
  { id: 209, name: 'BMW',           nameAr: 'بي إم دبليو',  serviceType: 'car', isChinese: false },
  { id: 210, name: 'Mercedes-Benz', nameAr: 'مرسيدس',       serviceType: 'car', isChinese: false },
  { id: 211, name: 'Volkswagen',    nameAr: 'فولكس واجن',   serviceType: 'car', isChinese: false },
  { id: 212, name: 'Ford',          nameAr: 'فورد',          serviceType: 'car', isChinese: false },
  { id: 213, name: 'Peugeot',       nameAr: 'بيجو',          serviceType: 'car', isChinese: false },
  { id: 214, name: 'Renault',       nameAr: 'رينو',          serviceType: 'car', isChinese: false },
  { id: 215, name: 'Skoda',         nameAr: 'سكودا',         serviceType: 'car', isChinese: false },
  { id: 216, name: 'Opel',          nameAr: 'أوبل',          serviceType: 'car', isChinese: false },
  { id: 217, name: 'Lada',          nameAr: 'لادا',          serviceType: 'car', isChinese: false },
  { id: 218, name: 'Fiat',          nameAr: 'فيات',          serviceType: 'car', isChinese: false },
  { id: 219, name: 'Jeep',          nameAr: 'جيب',           serviceType: 'car', isChinese: false },

  // ── Scooter brands ────────────────────────────────────────────────────────
  { id: 301, name: 'Honda',         nameAr: 'هوندا',         serviceType: 'scooter', isChinese: false },
  { id: 302, name: 'Yamaha',        nameAr: 'ياماها',        serviceType: 'scooter', isChinese: false },
  { id: 303, name: 'Suzuki',        nameAr: 'سوزوكي',       serviceType: 'scooter', isChinese: false },
  { id: 304, name: 'Bajaj',         nameAr: 'باجاج',         serviceType: 'scooter', isChinese: false },
  { id: 305, name: 'TVS',           nameAr: 'TVS',           serviceType: 'scooter', isChinese: false },
  { id: 306, name: 'Lifan',         nameAr: 'ليفان',         serviceType: 'scooter', isChinese: true  },
  { id: 307, name: 'Loncin',        nameAr: 'لونسين',        serviceType: 'scooter', isChinese: true  },

  // ── Delivery brands ───────────────────────────────────────────────────────
  { id: 401, name: 'Honda',         nameAr: 'هوندا',         serviceType: 'delivery', isChinese: false },
  { id: 402, name: 'Yamaha',        nameAr: 'ياماها',        serviceType: 'delivery', isChinese: false },
  { id: 403, name: 'Bajaj',         nameAr: 'باجاج',         serviceType: 'delivery', isChinese: false },
  { id: 404, name: 'Toyota',        nameAr: 'تويوتا',       serviceType: 'delivery', isChinese: false },
  { id: 405, name: 'Kia',           nameAr: 'كيا',           serviceType: 'delivery', isChinese: false },
];

// ─── Models ───────────────────────────────────────────────────────────────────

type FallbackModel = {
  id: number;
  brandId: number;
  name: string;
  nameAr: string | null;
  minYear: number;
  maxYear: number | null;
  seatCapacity: number | null;
};

const ALL_MODELS: FallbackModel[] = [
  // ── Shuttle models ────────────────────────────────────────────────────────
  // Toyota shuttle (brandId 101)
  { id: 10101, brandId: 101, name: 'Coaster',         nameAr: 'كوستر',         minYear: 2000, maxYear: null, seatCapacity: 30 },
  { id: 10102, brandId: 101, name: 'Hiace',            nameAr: 'هايس',          minYear: 2005, maxYear: null, seatCapacity: 15 },
  { id: 10103, brandId: 101, name: 'Hiace Grand Cabin',nameAr: 'هايس جراند',    minYear: 2010, maxYear: null, seatCapacity: 13 },
  // Hyundai shuttle (brandId 102)
  { id: 10201, brandId: 102, name: 'County',           nameAr: 'كاونتي',        minYear: 2005, maxYear: null, seatCapacity: 28 },
  { id: 10202, brandId: 102, name: 'H350',             nameAr: 'H350',          minYear: 2015, maxYear: null, seatCapacity: 18 },
  { id: 10203, brandId: 102, name: 'Starex',           nameAr: 'ستاركس',        minYear: 2005, maxYear: null, seatCapacity: 12 },
  // Mitsubishi shuttle (brandId 103)
  { id: 10301, brandId: 103, name: 'Rosa',             nameAr: 'روزا',          minYear: 2005, maxYear: null, seatCapacity: 28 },
  { id: 10302, brandId: 103, name: 'Canter Bus',       nameAr: 'كانتر باص',     minYear: 2005, maxYear: null, seatCapacity: 22 },
  // Mercedes shuttle (brandId 104)
  { id: 10401, brandId: 104, name: 'Sprinter',         nameAr: 'سبرينتر',       minYear: 2005, maxYear: null, seatCapacity: 16 },
  { id: 10402, brandId: 104, name: 'Vito',             nameAr: 'فيتو',          minYear: 2006, maxYear: null, seatCapacity: 8  },
  { id: 10403, brandId: 104, name: 'Tourismo',         nameAr: 'توريسمو',       minYear: 2010, maxYear: null, seatCapacity: 55 },
  // Volkswagen shuttle (brandId 105)
  { id: 10501, brandId: 105, name: 'Crafter',          nameAr: 'كرافتر',        minYear: 2007, maxYear: null, seatCapacity: 16 },
  { id: 10502, brandId: 105, name: 'Transporter',      nameAr: 'ترانسبورتر',   minYear: 2006, maxYear: null, seatCapacity: 9  },
  // Nissan shuttle (brandId 106)
  { id: 10601, brandId: 106, name: 'Urvan',            nameAr: 'ارفان',         minYear: 2005, maxYear: null, seatCapacity: 15 },
  { id: 10602, brandId: 106, name: 'Civilian',         nameAr: 'سيفيليان',      minYear: 2005, maxYear: null, seatCapacity: 28 },
  // Kia shuttle (brandId 107)
  { id: 10701, brandId: 107, name: 'Besta',            nameAr: 'بيستا',         minYear: 2005, maxYear: null, seatCapacity: 15 },
  { id: 10702, brandId: 107, name: 'Grand Carnival',   nameAr: 'جراند كارنيفال',minYear: 2010, maxYear: null, seatCapacity: 11 },
  // Ford shuttle (brandId 108)
  { id: 10801, brandId: 108, name: 'Transit',          nameAr: 'ترانزيت',       minYear: 2005, maxYear: null, seatCapacity: 15 },
  // Isuzu shuttle (brandId 109)
  { id: 10901, brandId: 109, name: 'NQR Bus',          nameAr: 'NQR باص',       minYear: 2005, maxYear: null, seatCapacity: 33 },
  { id: 10902, brandId: 109, name: 'NPR Bus',          nameAr: 'NPR باص',       minYear: 2005, maxYear: null, seatCapacity: 26 },
  // MAN shuttle (brandId 110)
  { id: 11001, brandId: 110, name: "Lion's Coach",     nameAr: 'ليونز كوتش',   minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 11002, brandId: 110, name: "Lion's City",      nameAr: 'ليونز سيتي',   minYear: 2010, maxYear: null, seatCapacity: 70 },
  // Yutong (brandId 111)
  { id: 11101, brandId: 111, name: 'ZK6122H9',         nameAr: 'ZK6122H9',     minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 11102, brandId: 111, name: 'ZK6109H',          nameAr: 'ZK6109H',      minYear: 2010, maxYear: null, seatCapacity: 45 },
  { id: 11103, brandId: 111, name: 'ZK6938H',          nameAr: 'ZK6938H',      minYear: 2012, maxYear: null, seatCapacity: 35 },
  // Higer (brandId 112)
  { id: 11201, brandId: 112, name: 'KLQ6129Q',         nameAr: 'KLQ6129Q',     minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 11202, brandId: 112, name: 'KLQ6119Q',         nameAr: 'KLQ6119Q',     minYear: 2010, maxYear: null, seatCapacity: 45 },
  // King Long (brandId 113)
  { id: 11301, brandId: 113, name: 'XMQ6127Y',         nameAr: 'XMQ6127Y',     minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 11302, brandId: 113, name: 'XMQ6900',          nameAr: 'XMQ6900',      minYear: 2010, maxYear: null, seatCapacity: 35 },
  // Golden Dragon (brandId 114)
  { id: 11401, brandId: 114, name: 'XML6127',          nameAr: 'XML6127',      minYear: 2010, maxYear: null, seatCapacity: 55 },
  { id: 11402, brandId: 114, name: 'XML6103',          nameAr: 'XML6103',      minYear: 2010, maxYear: null, seatCapacity: 45 },
  // Zhongtong (brandId 115)
  { id: 11501, brandId: 115, name: 'LCK6127H',         nameAr: 'LCK6127H',     minYear: 2012, maxYear: null, seatCapacity: 55 },
  { id: 11502, brandId: 115, name: 'LCK6107H',         nameAr: 'LCK6107H',     minYear: 2012, maxYear: null, seatCapacity: 45 },

  // ── Car models ────────────────────────────────────────────────────────────
  // Toyota car (brandId 201)
  { id: 20101, brandId: 201, name: 'Camry',            nameAr: 'كامري',         minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 20102, brandId: 201, name: 'Corolla',          nameAr: 'كورولا',        minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 20103, brandId: 201, name: 'Yaris',            nameAr: 'ياريس',         minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20104, brandId: 201, name: 'Land Cruiser',     nameAr: 'لاند كروزر',   minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 20105, brandId: 201, name: 'Fortuner',         nameAr: 'فورتشنر',       minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20106, brandId: 201, name: 'RAV4',             nameAr: 'RAV4',          minYear: 2007, maxYear: null, seatCapacity: null },
  // Hyundai car (brandId 202)
  { id: 20201, brandId: 202, name: 'Elantra',          nameAr: 'إيلانترا',      minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20202, brandId: 202, name: 'Tucson',           nameAr: 'توسان',         minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20203, brandId: 202, name: 'Sonata',           nameAr: 'سوناتا',        minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20204, brandId: 202, name: 'Accent',           nameAr: 'أكسينت',        minYear: 2006, maxYear: null, seatCapacity: null },
  // Kia car (brandId 203)
  { id: 20301, brandId: 203, name: 'Sportage',         nameAr: 'سبورتاج',       minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20302, brandId: 203, name: 'Cerato',           nameAr: 'سيراتو',        minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20303, brandId: 203, name: 'Picanto',          nameAr: 'بيكانتو',       minYear: 2008, maxYear: null, seatCapacity: null },
  { id: 20304, brandId: 203, name: 'Rio',              nameAr: 'ريو',           minYear: 2007, maxYear: null, seatCapacity: null },
  // Nissan car (brandId 204)
  { id: 20401, brandId: 204, name: 'Sunny',            nameAr: 'صني',           minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20402, brandId: 204, name: 'Sentra',           nameAr: 'سنترا',         minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20403, brandId: 204, name: 'Altima',           nameAr: 'ألتيما',        minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20404, brandId: 204, name: 'Patrol',           nameAr: 'باترول',        minYear: 2005, maxYear: null, seatCapacity: null },
  // Honda (brandId 205)
  { id: 20501, brandId: 205, name: 'Civic',            nameAr: 'سيفيك',         minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20502, brandId: 205, name: 'Accord',           nameAr: 'أكورد',         minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20503, brandId: 205, name: 'CR-V',             nameAr: 'CR-V',          minYear: 2007, maxYear: null, seatCapacity: null },
  // Chevrolet (brandId 206)
  { id: 20601, brandId: 206, name: 'Optra',            nameAr: 'أوبترا',        minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 20602, brandId: 206, name: 'Aveo',             nameAr: 'أفيو',          minYear: 2006, maxYear: null, seatCapacity: null },
  { id: 20603, brandId: 206, name: 'Captiva',          nameAr: 'كابتيفا',       minYear: 2007, maxYear: null, seatCapacity: null },
  // Mitsubishi car (brandId 207)
  { id: 20701, brandId: 207, name: 'Lancer',           nameAr: 'لانسر',         minYear: 2005, maxYear: null, seatCapacity: null },
  { id: 20702, brandId: 207, name: 'Outlander',        nameAr: 'أوتلاندر',      minYear: 2007, maxYear: null, seatCapacity: null },
  // Mercedes car (brandId 210)
  { id: 21001, brandId: 210, name: 'C-Class',          nameAr: 'C-Class',       minYear: 2008, maxYear: null, seatCapacity: null },
  { id: 21002, brandId: 210, name: 'E-Class',          nameAr: 'E-Class',       minYear: 2008, maxYear: null, seatCapacity: null },
  // Peugeot (brandId 213)
  { id: 21301, brandId: 213, name: '208',              nameAr: '208',           minYear: 2012, maxYear: null, seatCapacity: null },
  { id: 21302, brandId: 213, name: '301',              nameAr: '301',           minYear: 2013, maxYear: null, seatCapacity: null },
  { id: 21303, brandId: 213, name: '3008',             nameAr: '3008',          minYear: 2017, maxYear: null, seatCapacity: null },
  // Renault (brandId 214)
  { id: 21401, brandId: 214, name: 'Symbol',           nameAr: 'سيمبول',        minYear: 2009, maxYear: null, seatCapacity: null },
  { id: 21402, brandId: 214, name: 'Logan',            nameAr: 'لوجان',         minYear: 2008, maxYear: null, seatCapacity: null },
  { id: 21403, brandId: 214, name: 'Duster',           nameAr: 'داستر',         minYear: 2012, maxYear: null, seatCapacity: null },
];

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Returns fallback brands filtered by the API service type string
 * ('shuttle' | 'car' | 'scooter' | 'delivery').
 */
export function getFallbackBrands(serviceType: string): FallbackBrand[] {
  return ALL_BRANDS.filter(b => b.serviceType === serviceType);
}

/**
 * Returns fallback models for the given brandId (static fallback only).
 * Falls back to a generic entry if the brand has no models defined.
 */
export function getFallbackModels(brandId: number): FallbackModel[] {
  const specific = ALL_MODELS.filter(m => m.brandId === brandId);
  if (specific.length > 0) return specific;
  return [
    { id: 99999, brandId, name: 'Standard Model', nameAr: 'موديل قياسي', minYear: 2005, maxYear: null, seatCapacity: null },
  ];
}

/**
 * Returns a generic year range as fallback (2005 → current year, newest first).
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
  { id: 1,  nameEn: 'White',   nameAr: 'أبيض',    hexCode: '#FFFFFF' },
  { id: 2,  nameEn: 'Black',   nameAr: 'أسود',    hexCode: '#1e1e28' },
  { id: 3,  nameEn: 'Silver',  nameAr: 'فضي',     hexCode: '#C0C0C0' },
  { id: 4,  nameEn: 'Gray',    nameAr: 'رمادي',   hexCode: '#808080' },
  { id: 5,  nameEn: 'Red',     nameAr: 'أحمر',    hexCode: '#E53935' },
  { id: 6,  nameEn: 'Blue',    nameAr: 'أزرق',    hexCode: '#1565C0' },
  { id: 7,  nameEn: 'Green',   nameAr: 'أخضر',    hexCode: '#388E3C' },
  { id: 8,  nameEn: 'Beige',   nameAr: 'بيج',     hexCode: '#D4B896' },
  { id: 9,  nameEn: 'Brown',   nameAr: 'بني',     hexCode: '#795548' },
  { id: 10, nameEn: 'Gold',    nameAr: 'ذهبي',    hexCode: '#FFC107' },
  { id: 11, nameEn: 'Orange',  nameAr: 'برتقالي', hexCode: '#F57C00' },
  { id: 12, nameEn: 'Maroon',  nameAr: 'كستنائي', hexCode: '#880E4F' },
  { id: 13, nameEn: 'Navy',    nameAr: 'كحلي',    hexCode: '#0D1B4B' },
  { id: 14, nameEn: 'Pearl',   nameAr: 'لؤلؤي',   hexCode: '#F5F0E8' },
];

// Keep for backward-compat (not used after this fix)
export const FALLBACK_BRANDS = ALL_BRANDS;
