/**
 * File: ui/app/router/index.js
 * Description: Vue Router configuration for the application, defining all routes and navigation behavior
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../pages/LoginPage.vue';
import StatusPage from '../pages/StatusPage.vue';
import AuthPage from '../pages/AuthPage.vue';
import NotFound from '../pages/NotFound.vue';

const routes = [
    {
        component: StatusPage,
        name: 'status',
        path: '/',
    },
    {
        component: LoginPage,
        name: 'login',
        path: '/login',
    },
    {
        component: AuthPage,
        name: 'auth',
        path: '/auth',
    },
    {
        component: NotFound,
        name: 'not-found',
        path: '/:pathMatch(.*)*',
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior() {
        return { left: 0, top: 0 };
    },
});

router.beforeEach((to, from, next) => {
    if (to.name === 'login') {
        return next({ name: 'status' });
    }
    next();
});

export default router;
