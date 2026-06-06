import React from 'react';
import {
  AlertCircle, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight,
  Award, Bell, Briefcase, Check, CheckCircle,
  ChevronLeft, ChevronRight, ChevronUp, Clock, CreditCard,
  DollarSign, Download, Eye, FileText, Gift, GitBranch,
  Globe, HelpCircle, Home, Inbox, Lock, LogOut, Map, MapPin,
  MessageCircle, MessageSquare, Mic, Moon, Navigation, Package,
  Phone, Play, Plus, Radio, Search, Settings, Share2,
  Shield, Sliders, Star, Sun, Tag, TrendingUp, Truck,
  User, Users, Volume2, Wifi, WifiOff, X, Zap,
} from 'lucide-react-native';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  'alert-circle': AlertCircle,
  'arrow-down-left': ArrowDownLeft,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  'award': Award,
  'bell': Bell,
  'briefcase': Briefcase,
  'check': Check,
  'check-circle': CheckCircle,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'clock': Clock,
  'credit-card': CreditCard,
  'dollar-sign': DollarSign,
  'download': Download,
  'eye': Eye,
  'file-text': FileText,
  'gift': Gift,
  'git-branch': GitBranch,
  'globe': Globe,
  'help-circle': HelpCircle,
  'home': Home,
  'inbox': Inbox,
  'lock': Lock,
  'log-out': LogOut,
  'map': Map,
  'map-pin': MapPin,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  'mic': Mic,
  'moon': Moon,
  'navigation': Navigation,
  'package': Package,
  'phone': Phone,
  'play': Play,
  'plus': Plus,
  'radio': Radio,
  'search': Search,
  'settings': Settings,
  'share-2': Share2,
  'shield': Shield,
  'sliders': Sliders,
  'star': Star,
  'sun': Sun,
  'tag': Tag,
  'trending-up': TrendingUp,
  'truck': Truck,
  'user': User,
  'users': Users,
  'volume-2': Volume2,
  'wifi': Wifi,
  'wifi-off': WifiOff,
  'x': X,
  'zap': Zap,
};

type FeatherIconProps = {
  name: string;
  size?: number;
  color?: string;
};

export function FeatherIcon({ name, size = 24, color = '#000' }: FeatherIconProps) {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={2} />;
}
