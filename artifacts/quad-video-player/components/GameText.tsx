import React, { forwardRef } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';

const GameText = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(
  function GameText({ style, ...props }, ref) {
    return (
      <NativeText
        {...props}
        ref={ref}
        style={[{ fontFamily: 'YosterIsland' }, style]}
      />
    );
  },
);

GameText.displayName = 'GameText';

export default GameText;
export { GameText };
