import Slider from '@react-native-community/slider';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

type NativeSliderProps = ComponentProps<typeof Slider>;
type TouchSliderProps = Omit<NativeSliderProps, 'value' | 'onValueChange' | 'onSlidingComplete'> & {
  value: number;
  onSlidingComplete: (value: number) => void;
  onDraftValueChange?: (value: number) => void;
};

export default function TouchSlider({
  value,
  onSlidingStart,
  onSlidingComplete,
  onDraftValueChange,
  ...props
}: TouchSliderProps) {
  const [draft, setDraft] = useState(value);
  const isSliding = useRef(false);

  useEffect(() => {
    if (!isSliding.current) setDraft(value);
  }, [value]);

  return (
    <Slider
      {...props}
      value={isSliding.current ? draft : value}
      onSlidingStart={(next) => {
        isSliding.current = true;
        setDraft(value);
        onSlidingStart?.(next);
      }}
      onValueChange={(next) => {
        setDraft(next);
        onDraftValueChange?.(next);
      }}
      onSlidingComplete={(next) => {
        isSliding.current = false;
        setDraft(next);
        onSlidingComplete(next);
      }}
    />
  );
}
