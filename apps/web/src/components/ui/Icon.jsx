import {
  FaBars,
  FaArrowRight,
  FaCertificate,
  FaVideo,
  FaCamera,
  FaFilter,
  FaCircleCheck,
  FaCirclePlay,
  FaCirclePause,
  FaPlay,
  FaStar,
  FaAward,
  FaShieldHalved,
  FaLaptopCode,
  FaFileShield,
  FaComments,
  FaLayerGroup,
  FaHeart,
  FaXmark,
  FaUser,
  FaBuilding,
  FaBuildingColumns,
  FaCompass,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaGear,
  FaIdCard,
  FaBullseye,
  FaBookOpen,
  FaBriefcase,
  FaChalkboard,
  FaChalkboardUser,
  FaEye,
  FaPen,
  FaTrash,
  FaPlus,
  FaSchool,
  FaUserGraduate,
  FaUserPen,
  FaGraduationCap,
  FaMagnifyingGlass,
  FaLock,
  FaRocket,
  FaChartLine,
  FaLink,
  FaBrain,
  FaBolt,
  FaLocationDot,
  FaBookmark,
} from 'react-icons/fa6';
import { FaLinkedinIn, FaFacebookF, FaInstagram } from 'react-icons/fa';

/**
 * Icon registry.
 *
 * The prototype loads the full FontAwesome stylesheet (~70 KB) from a CDN for about twenty
 * glyphs. These are the same FontAwesome 6 glyphs delivered as tree-shaken inline SVG, so only
 * the icons actually used ship — no third-party request on the critical path.
 *
 * Names follow FA6 (fa-check-circle → circle-check, fa-shield-alt → shield-halved).
 */
const REGISTRY = {
  bars: FaBars,
  xmark: FaXmark,
  user: FaUser,
  building: FaBuilding,
  compass: FaCompass,
  'chevron-down': FaChevronDown,
  'chevron-left': FaChevronLeft,
  'chevron-right': FaChevronRight,
  gear: FaGear,
  'arrow-right': FaArrowRight,
  certificate: FaCertificate,
  video: FaVideo,
  camera: FaCamera,
  filter: FaFilter,
  'circle-check': FaCircleCheck,
  'circle-play': FaCirclePlay,
  'circle-pause': FaCirclePause,
  play: FaPlay,
  'id-card': FaIdCard,
  bullseye: FaBullseye,
  'book-open': FaBookOpen,
  briefcase: FaBriefcase,
  chalkboard: FaChalkboard,
  'chalkboard-user': FaChalkboardUser,
  eye: FaEye,
  pen: FaPen,
  trash: FaTrash,
  plus: FaPlus,
  school: FaSchool,
  'user-graduate': FaUserGraduate,
  'user-pen': FaUserPen,
  'graduation-cap': FaGraduationCap,
  'magnifying-glass': FaMagnifyingGlass,
  lock: FaLock,
  rocket: FaRocket,
  'chart-line': FaChartLine,
  link: FaLink,
  brain: FaBrain,
  bolt: FaBolt,
  'location-dot': FaLocationDot,
  'building-columns': FaBuildingColumns,
  star: FaStar,
  /*
   * `bookmark` and `star` are deliberately different marks for two different candidate actions:
   * SAVED companies (star) is a private bookmark that tells the company nothing, while SHORTLISTED
   * companies (bookmark) are ones the candidate actually reached out to. Same shelf, different act.
   */
  bookmark: FaBookmark,
  award: FaAward,
  'shield-halved': FaShieldHalved,
  'laptop-code': FaLaptopCode,
  'file-shield': FaFileShield,
  comments: FaComments,
  'layer-group': FaLayerGroup,
  heart: FaHeart,
  linkedin: FaLinkedinIn,
  facebook: FaFacebookF,
  instagram: FaInstagram,
};

/**
 * @param {Object}  props
 * @param {string}  props.name       Key from the registry
 * @param {string}  [props.label]    Accessible name. Omit for decorative icons
 * @param {string}  [props.className]
 *
 * Decorative by default: without `label` the icon is aria-hidden, so screen readers skip it.
 * The prototype leaves every <i> exposed to assistive tech, which announces meaningless glyphs.
 */
export function Icon({ name, label, className }) {
  const Glyph = REGISTRY[name];

  if (!Glyph) {
    if (import.meta.env.DEV) console.warn(`Icon: unknown name "${name}"`);
    return null;
  }

  return (
    <Glyph
      className={className}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    />
  );
}
