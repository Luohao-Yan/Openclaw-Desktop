import React from 'react';

export const statusDotStyle = (color: string): React.CSSProperties => ({
  backgroundColor: color,
  boxShadow: `0 0 0 3px ${color}22`,
});
