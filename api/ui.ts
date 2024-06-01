import { createSystem } from 'frog/ui';

export const {
  Box,
  Columns,
  Column,
  Heading,
  HStack,
  Rows,
  Row,
  Spacer,
  Image,
  Text,
  VStack,
  vars,
  Divider
} = createSystem({
  colors: {
    background: '#1F1629',
    white: '#FFFFFF',
    green: '#B1FC5A'
  },
  fonts: {
    default: [
      {
        name: 'JetBrains Mono',
        source: 'google',
        weight: 800,
      },
      {
        name: 'JetBrains Mono',
        source: 'google',
        weight: 400,
      },
    ],
  },
});