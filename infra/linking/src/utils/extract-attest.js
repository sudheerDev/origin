import fetch from 'cross-fetch'
import { fetch as fetchH2 } from 'fetch-h2'
import cheerio from 'cheerio'
import safeEval from 'safe-eval'
import querystring from 'querystring'

import AttestationError from 'utils/attestation-error'
import logger from 'logger'

const YOUTUBE_SITE = 'youtube'
const TWITTER_SITE = 'twitter'
const LINKEDIN_SITE = 'linkedin'
const INSTAGRAM_SITE = 'instagram'
const TWITCH_SITE = 'twitch'
const PINTEREST_SITE = 'pinterest'

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be']
const TWITTER_DOMAINS = ['twitter.com', 'twttr.net', 'twttr.com']
const LINKEDIN_DOMAINS = ['linkedin.com']
const INSTAGRAM_DOMAINS = ['instagram.com', 'instagr.am']
const TWITCH_DOMAINS = ['instagram.com', 'instagr.am']
const PINTEREST_DOMAINS = ['pinterest.com', 'pinimg.com', 'pinterest.es', 'pinterest.ru', 'pinterest.jp', 'pinterest.co.uk', 'pinterest.de', 'pinterest.fr']

function matchDomains(host, domains) {
  const ihost = host.toLowerCase()
  for (const domain of domains) {
    logger.info("matching:", domain, " vs ", ihost)
    //either it is the domain or it's a subdomain
    return ihost == domain || (ihost.endsWith(domain) && ihost[ihost.length - domain.length -1] == '.')
  }
}

function findReferralSite(referralUrl) {
  const url = new URL(referralUrl)
  const domainMap = [
    {
      site: YOUTUBE_SITE,
      domains: YOUTUBE_DOMAINS
    },
    {
      site: TWITTER_SITE,
      domains: TWITTER_DOMAINS
    },
    {
      site: LINKEDIN_SITE,
      domains: LINKEDIN_DOMAINS
    },
    {
      site: INSTAGRAM_SITE,
      domains: INSTAGRAM_DOMAINS
    },
    {
      site: TWITCH_SITE,
      domains: TWITCH_DOMAINS
    },
    {
      site: PINTEREST_SITE,
      domains: PINTEREST_DOMAINS
    },
  ]

  for (let i = 0; i < domainMap.length; i++) {
    const { site, domains } = domainMap[i]
    if (matchDomains(url.host, domains))
    {
      return site
    }
  }
  
  throw new AttestationError(`Unrecognised domain in referral url: ${referralUrl}`)
}

function slashEscaped(string) {
  return string.replace(/\//g, "\\/")
}

function getYTAccountUrl(channelId) {
  return `https://www.youtube.com/channel/${channelId}`
}

function getYTVideoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export async function extractAccountStat(accountUrl) {
  const site = findReferralSite(accountUrl)

  const response = await fetch(accountUrl)
  if(response.ok)
  {
    const $ = cheerio.load(await response.text())
    if (site == YOUTUBE_SITE) {
      const channelId = $('meta[itemprop="channelId"]').attr('content')
      const description = $('meta[name="description"]').attr('content')

      const referenceAccountUrl = getYTAccountUrl(channelId)
      if (referenceAccountUrl == accountUrl){
        const subscribersString = $('span.subscribed').html()
        let subscribers
        if (subscribersString){
          subscribers = Number(subscribersString.replace(/,/g, ''))
        }
        return {description, subscribers}
      } else {
        throw new AttestationError(`extracted channelId: ${channelId} does not match: ${accountUrl}`)
        logger.info(`extracted channelId: ${channelId} does not match: ${accountUrl}`)
      }
    } else if (site == TWITTER_SITE) {
      const description = $('meta[name="description"]').attr('content')
      const tweetUrlString = $('link[rel="canonical"]').attr('href')

      if(tweetUrlString.toLowerCase() == accountUrl.toLowerCase()) {
        const followersString = $('a.ProfileNav-stat[data-nav="followers"]').find('span.ProfileNav-value').attr('data-count')
        let followers
        if (followersString)
        {
          followers = Number(followersString)
        }
        return {description, followers}
      } else {
        logger.info(`extracted twitterUrl: ${tweetUrlString} does not match: ${accountUrl}`)
      }
    } else if (site == INSTAGRAM_SITE) {
      const description = $('meta[name="description"]').attr('content')
      const matchResult = /^\s*(.*)\s*Followers.*/g.exec(description)
      if (!matchResult || matchResult.length !== 2) {
        throw new AttestationError(`Can not fetch instagram followers from url: ${accountUrl}`)
      }
      const followers = matchResult[1]
      return {description, followers}
    } else {
      throw new AttestationError(`Unrecognised site: ${site} `)
    }
  } else {
    throw new AttestationError(`Can not fetch account: ${accountUrl} on ${site}`)
  }
}

export default async function extractAttestInfo(attestUrl, referralUrl) {
  const site = findReferralSite(referralUrl)
  logger.info("found site:", site)

  const rUrl = new URL(referralUrl)
  if (!rUrl.pathname && !rUrl.search) {
    // we are probably blocked by crossdomain policy
    // and have only a host
    throw new AttestationError(`Can not fetch data from: ${referralUrl}`)
  }


  if (site == YOUTUBE_SITE) {
    const response = await fetch(referralUrl)
    logger.info("fetching referralUrl:", referralUrl)

    if (response.ok) {
      const $ = cheerio.load(await response.text())

      /*
      for (const m of $('meta').get()) {
        logger.info("Meta:", $(m).attr())
      }
      */
      const type = $('meta[property="og:type"]').attr('content')
      const description = $('meta[name="description"]').attr('content')
      const channelId = $('meta[itemprop="channelId"]').attr('content')
      const videoId = $('meta[itemprop="videoId"]').attr('content')

      logger.info("stats:", {type, description, channelId, videoId})

      if (type.startsWith('video.') && videoId) {
        if (description.includes(attestUrl)) {
          logger.info("Video verified")
          return {site, account:channelId, accountUrl:getYTAccountUrl(channelId), sanitizedUrl:getYTVideoUrl(videoId)}
        } else {
          console.warn(`Can not find url: ${attestUrl} in video description`)
          throw new AttestationError(`Can not find url: ${attestUrl} in video description`)
        }
      } else if (type == 'profile' && channelId) {
        for(const link of $('li.channel-links-item').get())
        {
          const url = $(link).find('a').attr('href')
          if (url == attestUrl) {
            const accountUrl = getYTAccountUrl(channelId)
            return {site, account:channelId, accountUrl, sanitizedUrl:accountUrl}
          }
        }
        console.warn(`Can not find url: ${attestUrl} in any of the profile links`)
        throw new AttestationError(`Can not find url: ${attestUrl} in any of the profile links`)
      } else {
        console.warn(`Unrecognised ${site} page: ${type}`)
        throw new AttestationError(`Unrecognised ${site} page: ${type}`)
      }
    } else {
      throw new AttestationError(`Can not fetch data from: ${referralUrl}`)
    }
  }
  else if (site == INSTAGRAM_SITE) {
    const response = await fetch(referralUrl)
    logger.info("fetching referralUrl:", referralUrl)

    if (response.ok) {
      const instagramHtml = await response.text()

      const matchResult = /^https:\/\/www\.instagr.*\/(.*)\//g.exec(referralUrl)
      if (!matchResult || matchResult.length !== 2) {
        throw new AttestationError(`Invalid instagram account link: ${referralUrl}`)
      }

      const account = matchResult[1]
      const accountUrl = `https://www.instagram.com/${account}`
      const sanitizedUrl = accountUrl
      if (instagramHtml.includes(attestUrl.replace(/&.*/g, '')))
      {
        return {site, account, accountUrl, sanitizedUrl}
      } else {
        console.warn(`Can not find link ${attestUrl} in user biography`)
        throw new AttestationError(`Can not find link ${attestUrl} in user biography`)
      }
    } else {
      throw new AttestationError(`Can not fetch data from: ${referralUrl}`)
    }
  }
  else if (site == TWITTER_SITE) {
    const response = await fetch(referralUrl)
    logger.info("fetching referralUrl:", referralUrl)

    if (response.ok) {
      const $ = cheerio.load(await response.text())
      const description = $('meta[property="og:description"]').attr('content')
      const tweetUrlString = $('meta[property="og:url"]').attr('content')

      logger.info("tweet description and url:", description, tweetUrlString)
      const tweetUrl = new URL(tweetUrlString)
      const splitPaths = tweetUrl.pathname.split("/")

      if (!tweetUrl.hostname.endsWith("twitter.com") || splitPaths.length != 4 ||  splitPaths[2] != "status")
      {
        logger.warn(`Not a valid tweet: ${tweetUrl}`)
        throw new AttestationError(`Not a valid tweet: ${tweetUrl}`)
      }

      const account = splitPaths[1]
      const accountUrl = `https://twitter.com/${account}`
      const sanitizedUrl = `${accountUrl}/status/${splitPaths[3]}`
      const result = {site, account, accountUrl, sanitizedUrl}
      if (description.includes(attestUrl.replace(/&/g, '&amp;')))
      {
        return result
      } else {
        const shortUrlMatches = description.match(/https:\/\/t.co\/[a-z0-9]+/i)
        if (shortUrlMatches)
        {
          for (const match of shortUrlMatches) {
            const realUrl = $(`a[href="${match}"]`).attr('data-expanded-url')
            if (realUrl == attestUrl) {
              return result
            }
          }

          logger.warn(`Can not find referral url in tweet`)
          throw new AttestationError(`Can not find referral url in tweet`)
        } else {
          logger.warn(`Unexpected twitter url format`)
          throw new AttestationError(`Unexpected twitter url format`)
        }
      }
    } else {
      throw new AttestationError(`Can not fetch data from: ${referralUrl}`)
    }
  } else if ( site == LINKEDIN_SITE ) {
    const response = await fetchH2(referralUrl, 
      {headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:66.0) Gecko/20100101 Firefox/66.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.7,zh;q=0.3',
        'Upgrade-Insecure-Requests': '1'
      }})
    logger.info("fetchH2 response", response)

    if (response.ok) {
      const $ = cheerio.load(await response.text())
      const linkUrlString = $('meta[property="og:url"]').attr('content')

      const linkUrl = new URL(linkUrlString)
      const splitPaths = linkUrl.pathname.split("/")

      if (!linkUrl.hostname.endsWith("linkedin.com") || splitPaths.length != 3 || splitPaths[1] != "in")
      {
        logger.info("Not a valid linkedin profile:", linkUrl)
        return {}
      }
      const account = splitPaths[2]
      const accountUrl = linkUrl
      const sanitizedUrl = linkUrl
      const result = {site, account, accountUrl, sanitizedUrl}
      for (const link of $('a.topcard-links--flex').get())
      {
        const hrefString = $(link).attr('href')
        if (hrefString){
          const redirectUrl = new URL(hrefString)
          if(redirectUrl.path = '/redis/redirect' && redirectUrl.search){
            const query = querystring.parse(redirectUrl.substring(1))
            if (query.url == attestUrl) {
              return result
            }
          }
        }
      }
    }
  }

  return {}
}
