/**
 * Minimal Jest stand-in for react-native-reanimated: animations jump straight to their final
 * value. (The library's own mock needs native Worklets or a DOM, neither exists in Jest.)
 */
import { FlatList, Image, ScrollView, Text, View } from 'react-native';

type Callback = (finished: boolean) => void;

const finish = <T,>(value: T, callback?: Callback): T => {
  callback?.(true);
  return value;
};

export function useSharedValue<T>(initial: T) {
  const ref = {
    value: initial,
    get: () => ref.value,
    set: (next: T | ((current: T) => T)) => {
      ref.value = typeof next === 'function' ? (next as (c: T) => T)(ref.value) : next;
    },
  };
  return ref;
}

export const useDerivedValue = <T,>(compute: () => T) => {
  const value = compute();
  return { value, get: () => value };
};
export const useAnimatedStyle = <T,>(compute: () => T): T => compute();
export const useAnimatedProps = <T,>(compute: () => T): T => compute();
export const useAnimatedReaction = () => undefined;

export const withTiming = <T,>(value: T, _config?: unknown, callback?: Callback) =>
  finish(value, callback);
export const withSpring = <T,>(value: T, _config?: unknown, callback?: Callback) =>
  finish(value, callback);
export const withDelay = <T,>(_ms: number, value: T) => value;
export const withRepeat = <T,>(value: T) => value;
export const withSequence = <T,>(...values: T[]) => values[values.length - 1] as T;
export const cancelAnimation = () => undefined;
export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A) =>
    fn(...args);
export const runOnUI = runOnJS;

const identity = (t: number) => t;
const easingFactory = () => identity;
export const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  sin: identity,
  bezier: easingFactory,
  in: easingFactory,
  out: easingFactory,
  inOut: easingFactory,
};

/** Layout animation builders (`FadeIn.duration(200).delay(50)`) are chainable no-ops. */
const builder: unknown = new Proxy(function noop() {}, {
  get: () => builder,
  apply: () => builder,
});
export const FadeIn = builder;
export const FadeOut = builder;
export const FadeInDown = builder;
export const FadeInUp = builder;
export const FadeOutUp = builder;
export const FadeOutDown = builder;
export const ZoomIn = builder;
export const ZoomOut = builder;
export const SlideInDown = builder;
export const SlideOutDown = builder;
export const LinearTransition = builder;

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent: <T,>(component: T) => component,
};

export default Animated;
