import React from 'react';
import Popup from './popup/Popup';
import Manager from './manager/Manager';
import Settings from './settings/Settings';

function getRoute(): string {
  return window.location.hash.replace('#', '') || '/popup';
}

export default function App() {
  const route = getRoute();

  switch (route) {
    case '/popup':
      return <Popup />;
    case '/manager':
      return <Manager />;
    case '/settings':
      return <Settings />;
    default:
      return <Popup />;
  }
}
