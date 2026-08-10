import { Briefcase, CreditCard, Phone, Zap } from 'lucide-react-native';

// Maps a payout account's methodKey to an icon. Falls back to a generic card
// icon for any future method key (e.g. bank accounts). `instapayIcon` lets
// payout-accounts.tsx keep its existing Briefcase icon for instapay while the
// wallet screens keep their existing Zap icon — both preserved as-is.
type Props = {
  methodKey: string;
  color: string;
  size?: number;
  strokeWidth?: number;
  instapayIcon?: 'zap' | 'briefcase';
};

export function PayoutMethodIcon({ methodKey, color, size = 20, strokeWidth = 2, instapayIcon = 'zap' }: Props) {
  if (methodKey === 'vodafone_cash') return <Phone size={size} color={color} strokeWidth={strokeWidth} />;
  if (methodKey === 'instapay') {
    return instapayIcon === 'briefcase'
      ? <Briefcase size={size} color={color} strokeWidth={strokeWidth} />
      : <Zap size={size} color={color} strokeWidth={strokeWidth} />;
  }
  return <CreditCard size={size} color={color} strokeWidth={strokeWidth} />;
}
