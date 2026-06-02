import concurrent.futures
import requests

# Define the base URL pattern using a placeholder
# Replace 'example.com' and the path structure with your actual target
BASE_URL = "https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndex{service}.asmx"

# A comprehensive list of 100 common e-commerce, CRM, and system service names
SERVICE_NAMES = [
    "Products", "Orders", "Customers", "Inventory", "Items", "Content", "Accounts", 
    "Contacts", "Leads", "Users", "Invoices", "Payments", "Carts", "Checkouts", 
    "Shipping", "Tracking", "Categories", "Brands", "Reviews", "Search", "Index", 
    "Analytics", "Reports", "Logs", "Audit", "Config", "Settings", "Admin", 
    "Staff", "Vendors", "Suppliers", "Warehouse", "Stock", "Pricing", "Discounts", 
    "Coupons", "Promotions", "Marketing", "Campaigns", "Email", "Notifications", 
    "Sms", "Chat", "Support", "Tickets", "Tasks", "Events", "Calendar", 
    "Appointments", "Bookings", "Transactions", "Refunds", "Disputes", "Wallets", 
    "Subscriptions", "Plans", "Billing", "Addresses", "Profiles", "Preferences", 
    "History", "Favorites", "Wishlists", "Recommendations", "Feeds", "Sitemaps", 
    "Assets", "Media", "Images", "Files", "Documents", "Templates", "Pages", 
    "Posts", "Comments", "Tags", "Categories", "Tax", "Locations", "Stores", 
    "Regions", "Countries", "Languages", "Currencies", "Localization", "Translations", 
    "Auth", "Tokens", "Sessions", "Permissions", "Roles", "Security", "Webhooks", 
    "Integrations", "Plugins", "Extensions", "Api", "V1", "V2", "Status", "Health", "Crm"
]

def check_endpoint(service):
    """
    Sends a HEAD request to the constructed URL to check if the endpoint exists.
    Using HEAD instead of GET minimizes network overhead.
    """
    url = BASE_URL.format(service=service)
    try:
        # If your endpoint requires specific authentication headers, add them here
        headers = {
            'Content-Type': 'application/json',
            "GOLFBALLSADMIN": "uzh6@rR^KP9ZtSM"
        }
        
        response = requests.head(url, headers=headers, timeout=5)
        return service, response.status_code, url
    except requests.RequestException as e:
        return service, None, url

def main():
    print(f"Starting discovery probe against base template: {BASE_URL}\n")
    print(f"{'Service Name':<20} | {'Status Code':<12} | {'URL'}")
    print("-" * 80)

    # Use a ThreadPoolExecutor to run requests concurrently
    # Max workers can be adjusted based on rate-limiting considerations
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        # Map the check_endpoint function to the list of service names
        results = executor.map(check_endpoint, SERVICE_NAMES)
        
        for service, status, url in results:
            if status is not None:
                # Highlight successful hits (200 OK) or authentication blocks (401/403)
                # Filter out 404s to keep the output clean
                if status != 404:
                    print(f"{service:<20} | {status:<12} | {url}")
            else:
                print(f"{service:<20} | {'ERROR':<12} | {url}")

if __name__ == "__main__":
    main()