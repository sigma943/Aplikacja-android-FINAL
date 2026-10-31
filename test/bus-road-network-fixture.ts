import {bundledRoadNetworkRoute} from '../lib/bundled-road-network';
(window as unknown as {route:(stops:[number,number][])=>Promise<[number,number][]>}).route=bundledRoadNetworkRoute;
