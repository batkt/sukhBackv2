const axios = require("axios");

const WALLET_API_BASE_URL = process.env.WALLET_API_BASE_URL || "http://localhost:30510/v1";
const WALLET_API_USERNAME = process.env.WALLET_API_USERNAME || "neo_bpay";
const WALLET_API_PASSWORD = process.env.WALLET_API_PASSWORD || "123456";

let walletServiceToken = null;
let tokenExpiry = null;

const billingListCache = new Map();
const billingByAddressCache = new Map();
const paymentCache = new Map();
const inflightRequests = new Map();

const CACHE_TTL = 30000; // 30 seconds for general billing cache
const POLLING_CACHE_TTL = 5000; // 5 seconds for status polling cache
const UNREGISTERED_USER_CACHE_TTL = 60000; // 1 minute for unregistered users
const unregisteredUsersCache = new Map();

// Address data caches (long TTL as these change rarely)
const addressCityCache = new Map();
const addressDistrictCache = new Map();
const addressKhorooCache = new Map();
const addressBairCache = new Map();
const ADDRESS_CACHE_TTL = 3600000; // 1 hour

function clearBillingListCache(userId) {
  if (!userId) return;
  billingListCache.delete(`billing_list_${userId}`);
}

function sanitizeNullValues(obj) {
  if (obj === null || obj === undefined) {
    return {};
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeNullValues(item));
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (value === null || value === undefined) {
        // Convert null/undefined to empty string for String fields
        sanitized[key] = "";
      } else if (Array.isArray(value)) {
        // Recursively sanitize arrays
        sanitized[key] = value.map(item => sanitizeNullValues(item));
      } else if (typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeNullValues(value);
      } else {
        // For other types (string, number, boolean), keep as is
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

async function getWalletServiceToken() {
  try {
    if (walletServiceToken && tokenExpiry && Date.now() < tokenExpiry) {
      return walletServiceToken;
    }

    const response = await axios.post(`${WALLET_API_BASE_URL}/auth/token`, {
      username: WALLET_API_USERNAME,
      password: WALLET_API_PASSWORD,
    }, {
      timeout: 10000,
    });

    if (response.data && response.data.accessToken) {
      walletServiceToken = response.data.accessToken;
      tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return walletServiceToken;
    }

    if (response.data && response.data.token) {
      walletServiceToken = response.data.token;
      tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return walletServiceToken;
    }

    console.error("❌ [WALLET API] Token not found in response:", response.data);
    throw new Error("Failed to get wallet service token - token not in response");
  } catch (error) {
    if (error.response) {
      console.error("❌ [WALLET API] Error response status:", error.response.status);
      console.error("❌ [WALLET API] Error response data:", error.response.data);
    } else if (error.request) {
      console.error("❌ [WALLET API] No response received. URL:", `${WALLET_API_BASE_URL}/auth/token`);
      console.error("❌ [WALLET API] Check if Wallet API service is running and accessible");
    } else {
      console.error("❌ [WALLET API] Error setting up request:", error.message);
    }
    console.error("❌ [WALLET API] Full error:", error.message);
    throw new Error(`Failed to get wallet service token: ${error.message}`);
  }
}

async function getUserInfo(userId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.get(`${WALLET_API_BASE_URL}/api/user`, {
      headers: {
        userId: userId,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && response.data.responseCode) {
      if (response.data.data && Object.keys(response.data.data).length > 0) {
        return response.data.data;
      }
      return null;
    }

    return null;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) {
        return null;
      }
      if (error.response.status === 400 && error.response.data) {
        return null;
      }
    }
    console.error("Error getting user info from wallet API:", error.message);
    throw error;
  }
}

async function getBillingByAddress(userId, bairId, doorNo) {
  try {
    const token = await getWalletServiceToken();
    const encodedDoorNo = encodeURIComponent(doorNo);
    
    const cacheKey = `${userId}:${bairId}:${doorNo}`;
    const cached = billingByAddressCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
       return cached.data;
    }

    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/billing/address/${bairId}/${encodedDoorNo}`,
      {
        headers: {
           userId: userId,
           Authorization: `Bearer ${token}`,
        },
      }
    );



    if (response.data && response.data.responseCode && response.data.data) {
      const data = response.data.data;
      let finalData = [];
      if (Array.isArray(data)) {
        finalData = data;
      } else if (typeof data === 'object') {
        finalData = [data];
      }
      
      billingByAddressCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
      return finalData;
    }

    return [];
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) {
        return [];
      }
      console.error("❌ [WALLET API] Error getting billing by address:", error.message);
      console.error("❌ [WALLET API] Error response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function registerUser(phone, email) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/user`,
      {
        email: email || `${phone}@sukh.mn`, // Default email if empty
        phone: phone,
      },
      {
        headers: {
          userId: phone,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      // Clear from unregistered cache if registration was successful
      unregisteredUsersCache.delete(phone);
      return response.data.data;
    }

    throw new Error("Failed to register user in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Registration failed";
      throw new Error(errorMessage);
    }
    console.error("Error registering user in wallet API:", error.message);
    throw error;
  }
}

async function getAddressCities() {
  try {
    // Check cache
    const cacheKey = 'all_cities';
    const cached = addressCityCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ADDRESS_CACHE_TTL)) {
      return cached.data;
    }

    const token = await getWalletServiceToken();
    
    const response = await axios.get(`${WALLET_API_BASE_URL}/api/address/city`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 15000,
    });

    if (response.data && response.data.responseCode && response.data.data) {
      addressCityCache.set(cacheKey, { timestamp: Date.now(), data: response.data.data });
      return response.data.data;
    }

    const result = response.data?.data || [];
    if (result.length > 0) {
      addressCityCache.set(cacheKey, { timestamp: Date.now(), data: result });
    }
    return result;
  } catch (error) {
    console.error("Error getting cities from wallet API:", error.message);
    throw error;
  }
}

async function getAddressDistricts(cityId) {
  try {
    // Check cache
    const cached = addressDistrictCache.get(cityId);
    if (cached && (Date.now() - cached.timestamp < ADDRESS_CACHE_TTL)) {
      return cached.data;
    }

    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/address/district/${cityId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      addressDistrictCache.set(cityId, { timestamp: Date.now(), data: response.data.data });
      return response.data.data;
    }

    const result = response.data?.data || [];
    if (result.length > 0) {
      addressDistrictCache.set(cityId, { timestamp: Date.now(), data: result });
    }
    return result;
  } catch (error) {
    console.error("Error getting districts from wallet API:", error.message);
    throw error;
  }
}

async function getAddressKhoroo(districtId) {
  try {
    // Check cache
    const cached = addressKhorooCache.get(districtId);
    if (cached && (Date.now() - cached.timestamp < ADDRESS_CACHE_TTL)) {
      return cached.data;
    }

    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/address/khoroo/${districtId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      addressKhorooCache.set(districtId, { timestamp: Date.now(), data: response.data.data });
      return response.data.data;
    }

    const result = response.data?.data || [];
    if (result.length > 0) {
      addressKhorooCache.set(districtId, { timestamp: Date.now(), data: result });
    }
    return result;
  } catch (error) {
    console.error("Error getting khoroo from wallet API:", error.message);
    throw error;
  }
}

async function getAddressBair(khorooId) {
  try {
    // Check cache
    const cached = addressBairCache.get(khorooId);
    if (cached && (Date.now() - cached.timestamp < ADDRESS_CACHE_TTL)) {
      return cached.data;
    }

    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/address/bair/${khorooId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      addressBairCache.set(khorooId, { timestamp: Date.now(), data: response.data.data });
      return response.data.data;
    }

    const result = response.data?.data || [];
    if (result.length > 0) {
      addressBairCache.set(khorooId, { timestamp: Date.now(), data: result });
    }
    return result;
  } catch (error) {
    console.error("Error getting bair from wallet API:", error.message);
    throw error;
  }
}

async function getBillers(userId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.get(`${WALLET_API_BASE_URL}/api/billers`, {
      headers: {
        userId: userId,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    return response.data?.data || [];
  } catch (error) {
    console.error("Error getting billers from wallet API:", error.message);
    throw error;
  }
}

async function getBillingByBiller(userId, billerCode, customerCode) {
  try {
    const token = await getWalletServiceToken();
    
    // Map Cyrillic biller codes to English (Wallet-Service expects English)
    const billerCodeMap = {
      'ЦАХИЛГААН': 'ELECTRIC',
      'УС': 'WATER',
      'ХАЛУУН_УС': 'HOT_WATER',
      'ХАЛААЛТ': 'HEATING',
    };
    
    // Use mapped code if available, otherwise use original
    const mappedBillerCode = billerCodeMap[billerCode] || billerCode;
    
    // URL encode the parameters to handle special characters
    const encodedBillerCode = encodeURIComponent(mappedBillerCode);
    const encodedCustomerCode = encodeURIComponent(customerCode);
    
    // Guard against hammering API for unregistered users
    const unregistered = unregisteredUsersCache.get(userId);
    if (unregistered && (Date.now() - unregistered.timestamp < UNREGISTERED_USER_CACHE_TTL)) {
       return null;
    }

    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/billing/biller/${encodedBillerCode}/${encodedCustomerCode}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Log response for debugging


    // Check if response is successful (responseCode can be true or "true" or truthy)
    const isSuccess = response.data && (
      response.data.responseCode === true || 
      response.data.responseCode === "true" || 
      (typeof response.data.responseCode === 'boolean' && response.data.responseCode) ||
      (typeof response.data.responseCode === 'string' && response.data.responseCode.toLowerCase() === 'true')
    );
    
    if (isSuccess && response.data.data) {
      let data = response.data.data;
      
      // If data is an array, process each item
      if (Array.isArray(data)) {
        // If array is empty, return empty array (not null)
        if (data.length === 0) {
          return [];
        }
        
        try {
          // Optimization: Fetch billing list ONCE for all customers
          const billingList = await getBillingList(userId);
          
          const enrichedData = await Promise.all(
            data.map(async (customer) => {
              // Inject billerCode into results so subsequent saveBilling calls have it
              customer.billerCode = mappedBillerCode;

              // If billingId is already present, return as is
              if (customer.billingId) {
                return customer;
              }
            
            // Try to get billingId from cached billing list or by customerId
            try {
              if (customer.customerId) {
                // Check in our already fetched list first (fastest)
                const matchingInList = billingList.find(b => 
                  b.customerId === customer.customerId || 
                  b.customerCode === customer.customerCode
                );

                if (matchingInList && matchingInList.billingId) {
                  customer.billingId = matchingInList.billingId;
                } else {
                  // Fallback: try direct customer lookup (another API call)
                  const billing = await getBillingByCustomer(userId, customer.customerId);
                  if (billing && billing.billingId) {
                    customer.billingId = billing.billingId;
                  } else {
                    customer.billingId = null;
                  }
                }
              } else {
                customer.billingId = null;
              }
            } catch (err) {
              customer.billingId = null;
            }
            return customer;
          }));
          
          // Automatically save billing to Wallet-Service for each customer if they have customerId
          // but no billingId (meaning they are not in the billing list yet)
          // Run these in parallel but don't wait for them if it blocks response
          enrichedData.forEach(async (customer) => {
            if (customer.customerId && !customer.billingId) {
              try {
                const savedBilling = await saveBilling(userId, { customerId: customer.customerId });
                if (savedBilling && savedBilling.billingId) {
                  customer.billingId = savedBilling.billingId;
                }
              } catch (saveError) {}
            }
          });
          
          return enrichedData;
          
          // Return enriched data even if billingId enrichment failed
          return enrichedData;
        } catch (enrichmentError) {
          console.error("⚠️ [WALLET API] Error during enrichment, returning original data:", enrichmentError.message);
          // If enrichment fails completely, return original data
          return data;
        }
      } else if (typeof data === 'object') {
        // Single customer object
        // Inject billerCode into single object result
        data.billerCode = mappedBillerCode;
        
        // Single customer object enrichment
        if (!data.billingId && data.customerId) {
          try {
            const billingList = await getBillingList(userId);
            const matchingInList = billingList.find(b => 
              b.customerId === data.customerId || 
              b.customerCode === data.customerCode
            );

            if (matchingInList && matchingInList.billingId) {
              data.billingId = matchingInList.billingId;
            } else {
              const billing = await getBillingByCustomer(userId, data.customerId);
              if (billing && billing.billingId) {
                data.billingId = billing.billingId;
              }
            }
          } catch (err) {
            data.billingId = null;
          }
        }
        
        // Auto-save if still no billingId
        if (data.customerId && !data.billingId) {
          saveBilling(userId, { customerId: data.customerId }).catch(() => null);
        }
        
        return data;
      }
      
      return data;
    }

    // If responseCode is false, return null but log the error message
    if (response.data && response.data.responseCode === false) {
      const errorMsg = response.data.responseMsg || "Биллингийн мэдээлэл олдсонгүй";
      
      // Update unregistered cache if necessary
      if (errorMsg.includes('бүртгэл хийгдээгүй') || errorMsg.includes('Notfound Error')) {
        unregisteredUsersCache.set(userId, { timestamp: Date.now() });
      }

      // Return null so controller can handle 404
      return null;
    }

    // If responseCode is false or data is missing, we don't log the entire structure to avoid clutter
    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error("❌ [WALLET API] Error getting billing by biller:", error.message);
    throw error;
  }
}

async function getBillingByCustomer(userId, customerId) {
  try {
    // Guard against hammering API for unregistered users
    const unregistered = unregisteredUsersCache.get(userId);
    if (unregistered && (Date.now() - unregistered.timestamp < UNREGISTERED_USER_CACHE_TTL)) {
       return null;
    }

    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/billing/customer/${customerId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error("Error getting billing by customer from wallet API:", error.message);
    throw error;
  }
}


async function getBillingList(userId) {
  try {
    const token = await getWalletServiceToken();
    
    // Log request for debugging

    // Check if user is known to be not registered to avoid hammering the API
    const unregistered = unregisteredUsersCache.get(userId);
    if (unregistered && (Date.now() - unregistered.timestamp < UNREGISTERED_USER_CACHE_TTL)) {
       return [];
    }
    
    // Check cache first
    const cacheKey = `billing_list_${userId}`;
    const cached = billingListCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
       return cached.data;
    }

    // Check if a request is already inflight
    if (inflightRequests.has(cacheKey)) {

        return await inflightRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        const response = await axios.get(`${WALLET_API_BASE_URL}/api/billing/list`, {
          headers: {
            userId: userId,
            Authorization: `Bearer ${token}`,
          },
        });
        
        // Log response for debugging


        const isSuccess = response.data && (
          response.data.responseCode === true || 
          response.data.responseCode === "true" || 
          (typeof response.data.responseCode === 'boolean' && response.data.responseCode) ||
          (typeof response.data.responseCode === 'string' && response.data.responseCode.toLowerCase() === 'true')
        );

        if (isSuccess && response.data.data) {
          let finalData = Array.isArray(response.data.data) ? response.data.data : [response.data.data];
          finalData = finalData.map(item => sanitizeNullValues(item));
          billingListCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
          return finalData;
        }

        // Handle 'User not registered' specifically to avoid hammering the API
        const responseMsg = response.data?.responseMsg || "";
        if (response.data?.responseCode === false && (responseMsg.includes('бүртгэл хийгдээгүй') || responseMsg.includes('Notfound Error'))) {
          // Cache empty result for unregistered users too, to prevent infinite loops/retries
          billingListCache.set(cacheKey, { timestamp: Date.now(), data: [], isNotRegistered: true });
          unregisteredUsersCache.set(userId, { timestamp: Date.now() }); // Mark user as unregistered
        }

        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, fetchPromise);
    return await fetchPromise;
  } catch (error) {
    console.error("❌ [WALLET API] Error getting billing list:", error.message);
    if (error.response) {
      console.error("❌ [WALLET API] Error response status:", error.response.status);
      console.error("❌ [WALLET API] Error response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function getBillingBills(userId, billingId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/billing/bills/${billingId}`,
      {
        headers: {
          userId: userId,  // Should be phoneNumber
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      if (response.data.data) {
        let data = response.data.data;
        
        if (Array.isArray(data)) {
          return data.map((item) => sanitizeNullValues(item));
        } else if (typeof data === 'object') {
          return [sanitizeNullValues(data)];
        }
      }
    }
    return [];
  } catch (error) {
    console.error("Error getting billing bills from wallet API:", error.message);
    if (error.response) {
      console.error("Error response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function getBillingPayments(userId, billingId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/billing/payments/${billingId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      if (response.data.data) {
        let data = response.data.data;
        
        if (Array.isArray(data)) {
          return data.map(item => sanitizeNullValues(item));
        } else if (typeof data === 'object') {
          return [sanitizeNullValues(data)];
        }
      }
    }

    return [];
  } catch (error) {
    if (error.response) {
      // If 404, return empty array (no payments exist yet)
      if (error.response.status === 404) {
        return [];
      }
      console.error("❌ [WALLET API] Error getting billing payments:", error.message);
    }
    throw error;
  }
}

// Helper function to clean objects from Mongoose/circular references
function cleanObjectForJSON(obj) {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  // Handle Mongoose documents
  if (obj.toObject && typeof obj.toObject === 'function') {
    return cleanObjectForJSON(obj.toObject());
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanObjectForJSON(item));
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key in obj) {
      // Skip Mongoose internal properties
      if (key === '_id' && obj[key] && typeof obj[key].toString === 'function') {
        cleaned[key] = obj[key].toString();
      } else if (key.startsWith('_') && key !== '_id') {
        // Skip other Mongoose internal properties
        continue;
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Check for circular references by checking if it's a Mongoose model/connection
        if (obj[key].constructor && obj[key].constructor.name === 'NativeConnection') {
          continue;
        }
        if (obj[key].constructor && obj[key].constructor.name === 'Mongoose') {
          continue;
        }
        cleaned[key] = cleanObjectForJSON(obj[key]);
      } else {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }
  
  return obj;
}

async function saveBilling(userId, billingData) {
  try {
    const token = await getWalletServiceToken();
    
    // Clean the billingData to remove Mongoose objects and circular references
    const cleanedBillingData = cleanObjectForJSON(billingData);
    
    // STRIP disallowed fields that cause Wallet API validation errors (e.g. billingName, billerCode)
    // Only allow specific creation fields
    const allowedFields = ["customerId"];
    const finalBillingData = {};
    for (const key of allowedFields) {
       if (cleanedBillingData[key] !== undefined && cleanedBillingData[key] !== null) {
          finalBillingData[key] = cleanedBillingData[key];
       }
    }

    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/billing`,
      finalBillingData,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );



    if (response.data && response.data.responseCode && response.data.data) {
      // CLEAR CACHE for this user
      billingListCache.delete(`billing_list_${userId}`);
      return response.data.data;
    }
    throw new Error(`Хэрэгчлэгчийн код буруу байна`);
  } catch (error) {
    if (error.response) {
      console.error("❌ [WALLET API] Error response status:", error.response.status);
      console.error("❌ [WALLET API] Error response data:", JSON.stringify(error.response.data));
      
      const errorMessage = "Хэрэглэгчийн код буруу байна";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error saving billing:", error.message);
    if (error.message.includes("circular")) {
      console.error("❌ [WALLET API] Circular structure detected in billingData");
    }
    throw error;
  }
}

async function removeBilling(userId, billingId) {
  try {
    const token = await getWalletServiceToken();
    


    const response = await axios.delete(
      `${WALLET_API_BASE_URL}/api/billing/${billingId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );



    // Check if response is successful (responseCode can be true or "true" or truthy)
    const isSuccess = response.data && (
      response.data.responseCode === true || 
      response.data.responseCode === "true" || 
      (typeof response.data.responseCode === 'boolean' && response.data.responseCode) ||
      (typeof response.data.responseCode === 'string' && response.data.responseCode.toLowerCase() === 'true')
    );

    if (isSuccess) {
      // CLEAR CACHE for this user
      billingListCache.delete(`billing_list_${userId}`);
      return response.data;
    }

    throw new Error(response.data?.responseMsg || "Failed to remove billing in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("❌ [WALLET API] Error removing billing status:", error.response.status);
      console.error("❌ [WALLET API] Error removing billing data:", JSON.stringify(error.response.data));
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to remove billing";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error removing billing:", error.message);
    throw error;
  }
}

async function removeBill(userId, billingId, billId) {
  try {
    const token = await getWalletServiceToken();
    


    const response = await axios.delete(
      `${WALLET_API_BASE_URL}/api/billing/${billingId}/bill/${billId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );



    // Check if response is successful (responseCode can be true or "true" or truthy)
    const isSuccess = response.data && (
      response.data.responseCode === true || 
      response.data.responseCode === "true" || 
      (typeof response.data.responseCode === 'boolean' && response.data.responseCode) ||
      (typeof response.data.responseCode === 'string' && response.data.responseCode.toLowerCase() === 'true')
    );

    if (isSuccess) {
      return response.data;
    }

    throw new Error(response.data?.responseMsg || "Failed to remove bill in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("❌ [WALLET API] Error removing bill status:", error.response.status);
      console.error("❌ [WALLET API] Error removing bill data:", JSON.stringify(error.response.data));
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to remove bill";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error removing bill:", error.message);
    throw error;
  }
}

async function recoverBill(userId, billingId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/billing/${billingId}/recover`,
      {},
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return response.data;
    }

    throw new Error("Failed to recover bill in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to recover bill";
      throw new Error(errorMessage);
    }
    console.error("Error recovering bill in wallet API:", error.message);
    throw error;
  }
}

async function changeBillingName(userId, billingId, newName) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/billing/${billingId}/name`,
      { name: newName },
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return response.data;
    }

    throw new Error("Failed to change billing name in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to change billing name";
      throw new Error(errorMessage);
    }
    console.error("Error changing billing name in wallet API:", error.message);
    throw error;
  }
}

async function createInvoice(userId, invoiceData) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/invoice`,
      invoiceData,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    // If responseCode is false, log the error message
    const errorMsg = response.data?.responseMsg || response.data?.message || "Failed to create invoice in Wallet API";
    console.error("❌ [WALLET API] Invoice creation failed:", errorMsg);
    throw new Error(errorMsg);
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to create invoice";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error creating invoice:", error.message);
    throw error;
  }
}

async function getInvoice(userId, invoiceId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/invoice/${invoiceId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error("❌ [WALLET API] Error getting invoice:", error.message);
    throw error;
  }
}

async function cancelInvoice(userId, invoiceId) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/invoice/${invoiceId}/cancel`,
      {},
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return response.data;
    }

    throw new Error("Failed to cancel invoice in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to cancel invoice";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error canceling invoice:", error.message);
    throw error;
  }
}

async function createPayment(userId, paymentData) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/payment`,
      paymentData,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    throw new Error("Failed to create payment in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to create payment";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error creating payment:", error.message);
    throw error;
  }
}

async function getPayment(userId, paymentId) {
  try {
    const token = await getWalletServiceToken();
    
    const cacheKey = `${userId}:${paymentId}`;
    const cached = paymentCache.get(cacheKey);
    // Use shorter TTL for payments because status changes are frequent
    if (cached && (Date.now() - cached.timestamp < POLLING_CACHE_TTL)) {
       return cached.data;
    }

    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/payment/${paymentId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      const data = response.data.data;
      
      // Only cache if not PAID yet, or if it IS paid cache it for longer
      const ttl = data.paymentStatus === 'PAID' ? CACHE_TTL : POLLING_CACHE_TTL;
      paymentCache.set(cacheKey, { timestamp: Date.now(), data, ttl });
      
      return data;
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error("❌ [WALLET API] Error getting payment:", error.message);
    throw error;
  }
}

async function updateQPayPayment(userId, paymentId, qpayData) {
  try {
    const token = await getWalletServiceToken();
    
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/payment/qpay/${paymentId}`,
      qpayData,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.responseCode) {
      // Clear billing list cache for the user so next list fetch is fresh
      billingListCache.delete(`billing_list_${userId}`);
      
      return response.data.data || response.data;
    }

    throw new Error("Failed to update QPay payment in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to update QPay payment";
      throw new Error(errorMessage);
    }
    console.error("❌ [WALLET API] Error updating QPay payment:", error.message);
    throw error;
  }
}

async function editUser(userId, userData) {
  try {
    const token = await getWalletServiceToken();
    
    // Strip fields that are not allowed in User update
    const allowedUserData = { ...userData };
    delete allowedUserData.billingName;
    delete allowedUserData.billingId;
    delete allowedUserData.id;
    delete allowedUserData._id;

    // Remove empty email if present, as Wallet API doesn't allow empty strings for validation
    if (allowedUserData.email === "") {
      delete allowedUserData.email;
    }
    
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/user`,
      allowedUserData,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.responseCode && response.data.data) {
      return response.data.data;
    }

    throw new Error("Failed to edit user in Wallet API");
  } catch (error) {
    if (error.response && error.response.data) {
      const errorMessage = error.response.data.responseMsg || error.response.data.message || "Failed to edit user";
      throw new Error(errorMessage);
    }
    console.error("Error editing user in wallet API:", error.message);
    throw error;
  }
}

async function loginUser(phone, password) {
  try {
    const token = await getWalletServiceToken();
    
    // TODO: Update this endpoint if Wallet API has a different login endpoint
    // Common endpoints might be: /api/auth/login, /api/user/login, /api/login
    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/auth/login`,
      {
        phone: phone,
        password: password,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.responseCode) {
      if (response.data.data) {
        return { success: true, data: response.data.data };
      }
      return { success: false, message: response.data.responseMsg || "Invalid credentials" };
    }

    return { success: false, message: "Login failed" };
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        return { success: false, message: "Invalid phone or password" };
      }
      return { success: false, message: error.response.data?.responseMsg || "Login failed" };
    }
    // If endpoint doesn't exist (404), return false but don't throw
    if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
      return { success: false, message: "Login endpoint not available" };
    }
    console.error("❌ [WALLET API] Error during login:", error.message);
    return { success: false, message: "Login failed" };
  }
}

async function createChat(userId, paymentId, reason) {
  try {
    const token = await getWalletServiceToken();
    const response = await axios.post(
      `${WALLET_API_BASE_URL}/api/chat`,
      { paymentId, reason },
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return sanitizeNullValues(response.data.data);
    }
    throw new Error(response.data?.responseMsg || "Chat creation failed");
  } catch (error) {
    console.error("❌ [WALLET API] createChat error:", error.message);
    throw error;
  }
}

async function getChat(userId, chatId) {
  try {
    const token = await getWalletServiceToken();
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/chat/${chatId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return sanitizeNullValues(response.data.data);
    }
    throw new Error(response.data?.responseMsg || "Failed to fetch chat");
  } catch (error) {
    console.error("❌ [WALLET API] getChat error:", error.message);
    throw error;
  }
}

async function getChatByObject(userId, objectId) {
  try {
    const token = await getWalletServiceToken();
    const response = await axios.get(
      `${WALLET_API_BASE_URL}/api/chat/object/${objectId}`,
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return sanitizeNullValues(response.data.data);
    }
    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) return null;
    console.error("❌ [WALLET API] getChatByObject error:", error.message);
    throw error;
  }
}

async function sendMessage(userId, chatId, message) {
  try {
    const token = await getWalletServiceToken();
    const response = await axios.put(
      `${WALLET_API_BASE_URL}/api/chat/${chatId}`,
      { message },
      {
        headers: {
          userId: userId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.responseCode) {
      return sanitizeNullValues(response.data.data);
    }
    throw new Error(response.data?.responseMsg || "Message send failed");
  } catch (error) {
    console.error("❌ [WALLET API] sendMessage error:", error.message);
    throw error;
  }
}

module.exports = {
  getUserInfo,
  getBillingByAddress,
  getWalletServiceToken,
  registerUser,
  getAddressCities,
  getAddressDistricts,
  getAddressKhoroo,
  getAddressBair,
  getBillers,
  getBillingByBiller,
  getBillingByCustomer,
  getBillingList,
  getBillingBills,
  getBillingPayments,
  getPayment,
  updateQPayPayment,
  saveBilling,
  removeBilling,
  removeBill,
  recoverBill,
  changeBillingName,
  createInvoice,
  getInvoice,
  cancelInvoice,
  createPayment,
  editUser,
  loginUser,
  clearBillingListCache,
  createChat,
  getChat,
  getChatByObject,
  sendMessage,
};

