import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useProvinces,
  useDistricts,
  useSectors,
  useCells,
  useVillages,
} from "@/hooks/useLocations";

type FormData = Record<string, unknown>;

interface Props {
  value: FormData;
  /** Single-key setter; called once per changed level (parent batches via getValues). */
  onChange: (name: string, value: unknown) => void;
}

const toOptions = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

/** Cascading Province → District → Sector → Cell → Village picker. Each level is a
 *  searchable select where the dataset has entries, and falls back to free text
 *  where it doesn't yet — so clinicians are never blocked. Selecting a level clears
 *  the levels below it. Values are stored as province/district/sector/cell/village. */
export const AddressPicker = ({ value, onChange }: Props) => {
  const v = (k: string) => (value[k] == null ? "" : String(value[k]));
  const province = v("province");
  const district = v("district");
  const sector = v("sector");
  const cell = v("cell");

  const { data: provinces = [] } = useProvinces();
  const { data: districts = [] } = useDistricts(province || null);
  const { data: sectors = [] } = useSectors(province || null, district || null);
  const { data: cells = [] } = useCells(province || null, district || null, sector || null);
  const { data: villages = [] } = useVillages(province || null, district || null, sector || null, cell || null);

  // Setting a level clears the levels below it (their previous values no longer apply).
  const set = (level: "province" | "district" | "sector" | "cell" | "village", val: string) => {
    const below: Record<typeof level, string[]> = {
      province: ["district", "sector", "cell", "village"],
      district: ["sector", "cell", "village"],
      sector: ["cell", "village"],
      cell: ["village"],
      village: [],
    };
    onChange(level, val);
    for (const k of below[level]) onChange(k, "");
  };

  const Level = ({
    level,
    label,
    options,
    disabled,
  }: {
    level: "province" | "district" | "sector" | "cell" | "village";
    label: string;
    options: string[];
    disabled?: boolean;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {options.length > 0 ? (
        <Combobox
          options={toOptions(options)}
          value={v(level)}
          onChange={(val) => set(level, val)}
          placeholder={disabled ? "Select the level above first" : `Select ${label.toLowerCase()}`}
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          disabled={disabled}
        />
      ) : (
        <Input
          value={v(level)}
          onChange={(e) => set(level, e.target.value)}
          placeholder={disabled ? "Select the level above first" : label}
          disabled={disabled}
        />
      )}
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Level level="province" label="Province" options={provinces} />
      <Level level="district" label="District" options={districts} disabled={!province} />
      <Level level="sector" label="Sector" options={sectors} disabled={!district} />
      <Level level="cell" label="Cell" options={cells} disabled={!sector} />
      <Level level="village" label="Village" options={villages} disabled={!cell} />
    </div>
  );
};
