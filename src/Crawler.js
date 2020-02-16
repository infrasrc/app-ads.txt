'use strict';

const URL             = require('url').URL;
const Promise         = require('bluebird');
const _               = require('lodash/fp');
const { parseAdsTxt } = require('ads.txt');
const request         = require('jaeger-superagent');
require('superagent-proxy')(request);

const { get } = request;


class Crawler {
    constructor({ proxyUrl } = {}) {
        this.proxyUrl = proxyUrl;
    }

    async crawlData(url, span) {
        try {
            const parsedUrl = new URL(url);
            return await Promise.any([
                this._fetchByBaselineUrl(parsedUrl, span),
                this._fetchByRemovingFirstSubDomain(parsedUrl, span),
                this._fetchInRootDomainWith1PublicSuffix(parsedUrl, span),
                this._fetchInRootDomainWith2PublicSuffix(parsedUrl, span)
            ]);
        } catch (error) {
            if (error.code === 'ERR_INVALID_URL') {
                throw error;
            }
            return this._createResponse();
        }
    }

    // www.rami.com -> www.rami.com
    async _fetchByBaselineUrl(url, span) {
        const appAdsUrl = `${url.hostname}/app-ads.txt`;
        return this._fetchByHttpsOrHttp(appAdsUrl, span);
    }

    // a.b.c.example.com -> b.c.example.com
    async _fetchByRemovingFirstSubDomain(url, span) {
        // try to fetch root domain
        const appAdsUrl = `${url.hostname.replace(/^[^.]+\./g, '')}/app-ads.txt`;
        return this._fetchByHttpsOrHttp(appAdsUrl, span);
    }

    // a.b.c.example.com -> example.com
    async _fetchInRootDomainWith1PublicSuffix(url, span) {
        const appAdsUrl = `${url.hostname.split('.').slice(-2).join('.')}/app-ads.txt`;
        return this._fetchByHttpsOrHttp(appAdsUrl, span);
    }

    // a.b.c.example.co.il -> example.co.il
    async _fetchInRootDomainWith2PublicSuffix(url, span) {
        const appAdsUrl = `${url.hostname.split('.').slice(-3).join('.')}/app-ads.txt`;
        return this._fetchByHttpsOrHttp(appAdsUrl, span);
    }

    async _fetchByHttpsOrHttp(url, span) {
        try {
            return await this._fetchUrl(`https://${url}`, span);
        } catch (error) {
        }

        return await this._fetchUrl(`http://${url}`, span);
    }

    async _fetchUrl(url, span) {
        const response      = await get(url, span)
            .proxy(this.proxyUrl)
            .timeout({
                response: 6000,  // Wait 6 seconds for the server to start sending,
                deadline: 60000, // Allow 1 minute for the file to finish loading.
            });
        const appAdsContent = parseAdsTxt(response.text);
        return _.isEmpty(appAdsContent.fields) ? this._createResponse() : this._createResponse(url, appAdsContent);
    }

    _createResponse(appAdsUrl = '', appAdsFileContent = '') {
        return {
            appAdsUrl: appAdsUrl,
            data     : appAdsFileContent
        };
    }
}

module.exports = Crawler;