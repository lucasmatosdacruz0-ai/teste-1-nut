

import React from 'react';
import { NavItem } from './types';
import { HomeIcon, ChatIcon, CalendarIcon, ChartIcon, StarIcon, GridIcon, BookOpenIcon, TrophyIcon, UserIcon } from './components/icons';


export const NAV_ITEMS: NavItem[] = [
    { name: 'Dashboard', icon: <HomeIcon /> },
    { name: 'Chat IA', icon: <ChatIcon /> },
    { name: 'Dieta', icon: <CalendarIcon /> },
    { name: 'Receitas', icon: <BookOpenIcon /> },
    { name: 'Favoritos', icon: <StarIcon /> },
    { name: 'Progresso', icon: <ChartIcon /> },
    { name: 'Recursos', icon: <GridIcon /> },
    { name: 'Conta', icon: <UserIcon /> },
];