import addressDirectory from '@/data/vietnam-administrative-units.json';

export interface VietnameseProvince {
  code: string;
  name: string;
  type: string;
}

export interface VietnameseCommune {
  code: string;
  name: string;
  type: string;
  provinceCode: string;
}

interface VietnameseAddressDirectory {
  provinces: VietnameseProvince[];
  communes: VietnameseCommune[];
}

const directory = addressDirectory as VietnameseAddressDirectory;

export const vietnameseProvinces = directory.provinces;
export const vietnameseCommunes = directory.communes;

export function getCommunesForProvince(provinceCode: string) {
  return vietnameseCommunes.filter(commune => commune.provinceCode === provinceCode);
}

export function getVietnameseAddressNames(provinceCode: string, communeCode: string) {
  const province = vietnameseProvinces.find(item => item.code === provinceCode);
  const commune = vietnameseCommunes.find(
    item => item.code === communeCode && item.provinceCode === provinceCode,
  );
  if (!province || !commune) return null;
  return { province: province.name, commune: commune.name };
}

export function findVietnameseProvinceCode(name: string) {
  const normalized = name.trim().toLocaleLowerCase('vi');
  return vietnameseProvinces.find(province =>
    province.name.toLocaleLowerCase('vi') === normalized,
  )?.code ?? '';
}

export function findVietnameseCommuneCode(name: string, provinceCode: string) {
  const normalized = name.trim().toLocaleLowerCase('vi');
  return vietnameseCommunes.find(commune =>
    commune.provinceCode === provinceCode
      && commune.name.toLocaleLowerCase('vi') === normalized,
  )?.code ?? '';
}
