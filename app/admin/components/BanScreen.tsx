import {BanScreen as ThemedBanScreen} from '@/components/firebase/StartupScreens';
import type {DeviceData} from '@/components/firebase/types';

// The administrator's example uses the same themed screen as a real ban.
const preview={deviceInfo:'Podgląd',firstLogin:'',role:'user',status:'banned',banDetails:{
  expiresAt:'2024-05-25T21:59:00Z',reason:'Zbyt dużo lagów na czacie 😂',
  gifUrl:'https://media.tenor.com/W2d0DIf_7C0AAAAC/risitas.gif',silent:false,
}} as DeviceData;
export function BanScreen(){return <ThemedBanScreen device={preview}/>;}
