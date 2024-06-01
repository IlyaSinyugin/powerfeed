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
} = createSystem({
  colors: {
    background: '#1F1629',
    white: '#FFFFFF',
    green: '#B1FC5A'
  },
//   fonts: {
//     default: [
//       {
//         name: 'EB Garamond',
//         source: 'google',
//         weight: 900,
//       },
//       {
//         name: 'EB Garamond',
//         source: 'google',
//         weight: 400,
//       },
//     ],
//   },
});